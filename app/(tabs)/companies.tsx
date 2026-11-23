import {useCallback,useState} from 'react';
import {Redirect,useFocusEffect} from 'expo-router';
import {ActivityIndicator,ScrollView,Switch,Text,View} from 'react-native';
import {JsplModuleHeader} from '@/components/jspl/JsplModuleHeader';
import {StockButton,StockField,stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {supabase} from '@/supabase';

type Company={company_id:number;company_name:string;stock_owner_code:string|null;owns_stock:boolean;owns_vehicles:boolean};
const newCompany:Company={company_id:0,company_name:'',stock_owner_code:null,owns_stock:false,owns_vehicles:true};

export default function Companies(){
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [rows,setRows]=useState<Company[]>([]);
  const [adding,setAdding]=useState(false);
  const [draft,setDraft]=useState(newCompany);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    const result=await supabase.from('company').select('company_id,company_name,stock_owner_code,owns_stock,owns_vehicles').order('company_name');
    if(result.error){setError(result.error.message);return;}
    setRows(result.data??[]);
  },[]);
  useFocusEffect(useCallback(()=>{
    let active=true;
    async function open(){
      const {data,error:failure}=await supabase.rpc('my_farm_app_roles');
      if(!active)return;
      const admin=!failure&&Array.isArray(data)&&data.some((role:string)=>role.toLowerCase()==='admin');
      setAllowed(admin);
      if(admin)await load();
    }
    void open();
    return ()=>{active=false;};
  },[load]));
  async function save(company:Company){
    if(busy)return;
    setBusy(true);setError('');
    const values={company_name:company.company_name.trim(),owns_stock:company.owns_stock,owns_vehicles:company.owns_vehicles};
    try{
      const mutation=company.company_id?supabase.from('company').update(values).eq('company_id',company.company_id)
        :supabase.from('company').insert(values);
      const {data,error:failure}=await mutation.select('company_id');
      if(failure||!data?.length)throw Error(failure?.message??'Company save was not confirmed.');
      if(!company.company_id){setDraft(newCompany);setAdding(false);}
      await load();
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }
  if(allowed===null)return <ActivityIndicator/>;
  if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
  const switches=(company:Company,change:(next:Company)=>void)=><>
    <View style={styles.row}><Text style={styles.text}>Owns stock</Text>
      <Switch accessibilityLabel={company.company_name+' owns stock'} value={company.owns_stock} disabled={busy}
        onValueChange={owns_stock=>change({...company,owns_stock})}/></View>
    <View style={styles.row}><Text style={styles.text}>Owns vehicles</Text>
      <Switch accessibilityLabel={company.company_name+' owns vehicles'} value={company.owns_vehicles} disabled={busy}
        onValueChange={owns_vehicles=>change({...company,owns_vehicles})}/></View>
  </>;
  return <ScrollView contentContainerStyle={styles.page}>
    <JsplModuleHeader title="Companies" backLabel="Control Panel" backHref="/(tabs)/control-panel"/>
    {error?<Text style={styles.error}>{error}</Text>:null}
    {rows.map(company=><View key={company.company_id} style={[styles.card,styles.row]}>
      <Text style={[styles.text,{flex:1,minWidth:100}]}>{company.company_name}</Text>
      {switches(company,next=>void save(next))}
    </View>)}
    {adding?<View style={styles.card}>
      <StockField label="Company name" value={draft.company_name} onChange={company_name=>setDraft(current=>({...current,company_name}))}/>
      <View style={styles.row}>{switches(draft,setDraft)}
        <StockButton title="Save company" disabled={busy||!draft.company_name.trim()} onPress={()=>void save(draft)}/>
        <StockButton title="Cancel" disabled={busy} onPress={()=>setAdding(false)}/>
      </View>
    </View>:<View style={styles.row}><StockButton title="+ Add company" disabled={busy} onPress={()=>setAdding(true)}/></View>}
  </ScrollView>;
}

