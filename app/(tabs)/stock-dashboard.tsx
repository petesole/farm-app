import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useState} from 'react';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {ErpWalkthrough} from '@/components/jspl/ErpWalkthrough';
import {JsplDashboardButton} from '@/components/jspl/JsplDashboardButton';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockSelect,stockStyles} from '@/components/jspl/StockWorkflowControls';
import {jsplColors,jsplSpacing} from '@/constants/jspl-design';
import {stockRequest} from '@/utils/stock-workflow';

const modules=[
  {title:'Stock Operations',description:'Balances, receiving, stocktakes, and issues',icon:'inventory-2',route:'/stock-test'},
  {title:'Buying',description:'Purchase orders and supplier receiving',icon:'shopping-cart',route:'/buying'},
  {title:'Cash Book',description:'Accounts, payments, and reconciliation',icon:'account-balance-wallet',route:'/cashbook'},
  {title:'Town Trips',description:'Driver assignments and supplier collections',icon:'local-shipping',route:'/town-trips'},
  {title:'Job Cards',description:'Equipment repairs and general requests',icon:'build',route:'/job-cards'},
  {title:'Outstanding Issues',description:'Approvals, collections, and reconciliations',icon:'assignment-late',route:'/outstanding-issues'},
] as const;

export default function StockDashboard(){
  const [access,setAccess]=useState<Record<string,boolean>|null>(null);
  const [preview,setPreview]=useState('actual');
  const [error,setError]=useState('');
  const [counts,setCounts]=useState<Record<string,number>>({});
  useFocusEffect(useCallback(()=>{
    let active=true;
    stockRequest('?stock_access=1').then(result=>{
      if(active){setError('');setAccess(result.access);setCounts({});}
      if(result.access.can_main)stockRequest('?outstanding_issues=1').then(issues=>{if(active)setCounts(issues.counts);}).catch(()=>{});
    }).catch(failure=>{
      if(active){setError(failure.message);setAccess({});}
    });
    return ()=>{active=false;};
  },[]));

  const visible=preview==='actual'?access:{can_main:preview==='admin',is_admin:preview==='admin',is_stock:['admin','stock'].includes(preview),is_buyer:preview==='buyer',is_driver:preview==='driver',is_workshop:false};
  return <ScrollView contentContainerStyle={stockStyles.page}>
    <StockV2Header title="Stock" dashboard allowMain={access?.can_main===true}/>
    {access===null?<ActivityIndicator/>:null}
    {!!error?<Text style={stockStyles.error}>{error||'Main Dashboard access is required.'}</Text>:null}
    {access&&!error?<>
      {process.env.EXPO_PUBLIC_STOCK_DEVELOPMENT==='true'&&access.can_main?<StockSelect label="Test User Role" value={preview} options={['actual','admin','buyer','driver','stock'].map(id=>({id,label:id==='actual'?'My assigned roles':id[0].toUpperCase()+id.slice(1)}))} onChange={v=>setPreview(String(v??'actual'))}/>:null}
      {preview!=='actual'?<Text style={stockStyles.muted}>Dashboard preview. Select My assigned roles to open a module.</Text>:<ErpWalkthrough access={access}/>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:jsplSpacing.lg}}>
        {modules.filter(m=>visible&&(m.route==="/job-cards"?(visible.is_stock||visible.is_buyer||visible.is_workshop):m.route==="/town-trips"?(visible.is_stock||visible.is_driver||visible.is_buyer):m.route==="/buying"?(visible.is_admin||visible.is_buyer):m.route==="/stock-test"?visible.is_stock:visible.can_main)).map(module=><View key={module.route} style={{width:240,maxWidth:'100%'}}>
          <JsplDashboardButton disabled={preview!=='actual'} title={module.title} description={module.description}
            alertCount={preview==='actual'&&module.route==='/outstanding-issues'?Object.values(counts).reduce((total,n)=>total+Number(n),0):undefined}
            icon={<MaterialIcons name={module.icon} size={28} color={jsplColors.primaryDark}/>}
            onPress={()=>router.push({pathname:module.route,params:{from:'stock-dashboard'}})}/>
        </View>)}
      </View>
    </>:null}
  </ScrollView>;
}
