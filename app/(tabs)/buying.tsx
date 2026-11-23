import {useEffect, useState} from 'react';
import {useRouter} from 'expo-router';
import {ScrollView, Text} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton, stockStyles} from '@/components/jspl/StockWorkflowControls';
import {purchaseOrderApproval} from '@/utils/stock-navigation';
import {stockRequest} from '@/utils/stock-workflow';

export default function Buying() {
  const router = useRouter();
  const [access, setAccess] = useState<{is_admin?: boolean; is_buyer?: boolean; can_main?: boolean}>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    stockRequest('?stock_access=1').then(result => {
      if (active) setAccess(result.access);
    }).catch(failure => {
      if (active) setError(failure.message);
    });
    return () => {active = false;};
  }, []);
  return <ScrollView contentContainerStyle={stockStyles.page}>
    <StockV2Header title="Buying" dashboard allowMain={access?.can_main}/>
    {error ? <Text style={stockStyles.error}>{error}</Text> : null}
    {access?.is_buyer || access?.is_admin || access?.can_main ? <>
      <StockButton title="Purchase Orders" onPress={() => router.push({pathname:'/stock-v2-purchase-orders',params:{from:'buying'}})}/>
      {access.is_admin?<StockButton title="Approve Purchase Orders" onPress={()=>router.push(purchaseOrderApproval('/buying'))}/>:null}
      <StockButton title="Receiving" onPress={() => router.push({pathname:'/stock-v2-po-receiving',params:{from:'buying'}})}/>
      <StockButton title="Job Cards" onPress={() => router.push({pathname:'/job-cards',params:{from:'buying'}})}/>
      <StockButton title="Town Trips" onPress={() => router.push({pathname:'/town-trips',params:{from:'buying'}})}/>
    </> : access ? <Text style={stockStyles.text}>Buying access is required.</Text> : null}
  </ScrollView>;
}
