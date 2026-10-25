-- COMBINED GRV END-TO-END INTEGRATION TEST
-- RUN ONLY in a separately provisioned approved sandbox / disposable clone.
-- DO NOT execute against FarmingMain. Every assertion must pass before enabling UI posting.
-- Existing Stock V2 demo engine and private GRV bridge must be installed in sandbox.
--
-- IMPORTANT: the accounting linkage below is a TEST BRIDGE only.
-- It is NOT the final combined GRV server action and is NOT authorisation to publish.

BEGIN;
DO $test$
DECLARE
  v_old_line bigint;
  v_new_line bigint;
  v_new_document bigint;
  v_grv bigint;
  v_grv_line bigint;
  v_response jsonb;
  v_replay jsonb;
  v_total numeric;
  v_stock_movements integer;
  v_rejected boolean := false;
  v_request uuid := 'c79e1d54-86aa-4cc4-942b-f346ded92291';
  v_payload jsonb;
BEGIN
  SELECT dl.line_id INTO v_old_line
  FROM stock_v2.document_line dl
  JOIN stock_v2.document d ON d.document_id = dl.document_id
  JOIN stock_v2.grv_detail gd ON gd.document_id = d.document_id
  JOIN stock_v2.item i ON i.item_id = dl.item_id
  JOIN stock_v2.movement m ON m.document_line_id = dl.line_id AND m.quantity_delta > 0
  JOIN stock_v2.owner o ON o.owner_id = m.owner_id
  WHERE d.status = 'posted' AND d.document_number LIKE 'DEMO-%'
    AND o.owner_code = 'TEST_AO'
    AND i.item_code = 'DEMO_GLYPHOSATE'
    AND gd.supplier_name = 'Aims'
    AND dl.quantity >= 5
  ORDER BY dl.line_id DESC LIMIT 1;

  IF v_old_line IS NULL THEN
    RAISE EXCEPTION 'Sandbox needs a previously posted AO/Aims demo glyphosate receipt';
  END IF;

  INSERT INTO stock_v2_grv_test.accounting_grv(owner_code,supplier,invoice_number,invoice_date)
  VALUES ('AO','Aims','INTEGRATION-ROLLBACK-ONLY',DATE '2026-10-25')
  RETURNING id INTO v_grv;

  INSERT INTO stock_v2_grv_test.grv_line(grv_id,item_code,invoice_qty,unit_price)
  VALUES (v_grv,'DEMO_GLYPHOSATE',10,25)
  RETURNING id INTO v_grv_line;

  INSERT INTO stock_v2_grv_test.real_receipt_allocation(test_grv_line_id,real_document_line_id,quantity)
  VALUES (v_grv_line,v_old_line,5);

  v_payload := jsonb_build_object(
    'owner_code','AO','supplier','Aims','receipt_mode','dnote',
    'delivery_note','INTEGRATION-NEW-DNOTE','receipt_date','2026-10-25',
    'lines',jsonb_build_array(jsonb_build_object('item_code','DEMO_GLYPHOSATE','quantity',5))
  );
  SELECT stock_v2.demo_multi('direct_grv',v_request,v_payload) INTO v_response;
  v_new_document := (v_response->>'document_id')::bigint;

  SELECT dl.line_id INTO STRICT v_new_line
  FROM stock_v2.document_line dl WHERE dl.document_id=v_new_document;

  INSERT INTO stock_v2_grv_test.real_receipt_allocation(test_grv_line_id,real_document_line_id,quantity)
  VALUES (v_grv_line,v_new_line,5);

  SELECT SUM(quantity) INTO v_total
  FROM stock_v2_grv_test.real_receipt_allocation
  WHERE test_grv_line_id=v_grv_line;
  IF v_total <> 10 THEN RAISE EXCEPTION 'Wrong invoice allocation total %',v_total; END IF;

  SELECT COUNT(*) INTO v_stock_movements
  FROM stock_v2.movement WHERE document_line_id=v_new_line AND quantity_delta=5;
  IF v_stock_movements<>1 THEN RAISE EXCEPTION 'Expected ONE new physical receipt, found %',v_stock_movements; END IF;

  SELECT stock_v2.demo_multi('direct_grv',v_request,v_payload) INTO v_replay;
  IF v_replay->>'replayed' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Duplicate request was not idempotent';
  END IF;

  BEGIN
    UPDATE stock_v2_grv_test.real_receipt_allocation
    SET quantity=6 WHERE test_grv_line_id=v_grv_line AND real_document_line_id=v_new_line;
  EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Over-allocation accepted unexpectedly'; END IF;

  RAISE NOTICE 'PASS full demo receipt and accounting bridge (always ROLLBACK)';
END $test$;
ROLLBACK;

-- These verification queries MUST return zero.
SELECT COUNT(*) AS surviving_direct_receipts FROM stock_v2.grv_detail
 WHERE delivery_note='INTEGRATION-NEW-DNOTE';
SELECT COUNT(*) AS surviving_accounting_grvs FROM stock_v2_grv_test.accounting_grv
 WHERE invoice_number='INTEGRATION-ROLLBACK-ONLY';

-- Do not enable real posting based on this test alone: the private backend
-- must unify these operations into a single call, enforce roles and supplier
-- approval, handle partial quantities, and separate stock cost from invoice totals.
