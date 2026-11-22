import {useCallback,useState} from 'react';
import {useFocusEffect,useRouter} from 'expo-router';
import {RefreshControl,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton,stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {stockRequest} from '@/utils/stock-workflow';

const issues=[
  {key:'po_approvals',title:'Purchase orders awaiting approval',route:'/stock-v2-approvals',view:'po'},
  {key:'receipt_verifications',title:'Receipts awaiting verification',route:'/stock-v2-approvals',view:'receipt'},
  {key:'returned_receipts',title:'Receipts awaiting correction',route:null},
  {key:'outstanding_orders',title:'Orders with quantities outstanding',route:'/stock-v2-po-receiving'},
  {key:'invoices_pending',title:'Posted receipts waiting for invoices',route:'/stock-v2-grv-outstanding'},
  {key:'pending_collections',title:'Town Trip collections pending',route:'/town-trips',view:'history'},
  {key:'collected_outstanding',title:'Collected orders with quantities outstanding',route:'/town-trips',view:'history'},
  {key:'outstanding_parts',title:'Job Card parts still to issue',route:'/job-cards',view:'history'},
  {key:'cash_drafts',title:'Cash Book drafts awaiting review',route:'/cashbook',view:'history'},
  {key:'unreconciled_advances',title:'Trip advances awaiting reconciliation',route:'/cashbook',view:'trips'},
] as const;
type Counts=Record<(typeof issues)[number]['key'],number>;
type Returned={id:string;request_number:number;reference:string|null;assigned_to:string;decision_reason:string};

export default function OutstandingIssues(){
  const router=useRouter();
  const [counts,setCounts]=useState<Counts>();
  const [returned,setReturned]=useState<Returned[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const response=await stockRequest('?outstanding_issues=1');
      setCounts(response.counts);setReturned(response.returned);
    }
    catch(failure){setCounts(undefined);setError((failure as Error).message);}
    finally{setBusy(false);}
  },[]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));

  return <ScrollView contentContainerStyle={styles.page}
    refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void refresh()}/>}>
    <StockV2Header title="Outstanding Issues" dashboard allowMain={!!counts}/>
    {error?<Text style={styles.error}>{error}</Text>:null}
    {counts?issues.map(issue=><View key={issue.key} style={styles.card}>
      <Text style={styles.title}>{counts[issue.key]} · {issue.title}</Text>
      {issue.key==='returned_receipts'?returned.map(receipt=><Text key={receipt.id} style={styles.text}>
        {receipt.reference??'Receipt '+receipt.request_number} · {receipt.assigned_to} · {receipt.decision_reason}
      </Text>):null}
      {counts[issue.key]>0&&issue.route?<StockButton title="Open workflow" onPress={()=>{
        if(issue.route)router.push({pathname:issue.route,params:{
          from:'outstanding-issues',...('view' in issue?{view:issue.view}:{}),
        }});
      }}/>:null}
    </View>):null}
  </ScrollView>;
}
