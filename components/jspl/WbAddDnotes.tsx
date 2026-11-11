import {useRef,useState} from 'react';
import {Image,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {jsplColors as C} from '../../constants/jspl-design';
import {supabase} from '../../supabase';
import {wbFormatDate,wbParseDate,wbToday} from '../../utils/wb-date';
import {DnoteRange,validateDnoteRanges} from '../../utils/wb-dnote-register';

function yesterday(){const iso=wbParseDate(wbToday())!;const day=new Date(iso+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-1);return wbFormatDate(day.toISOString().slice(0,10));}
function requestId(){return globalThis.crypto.randomUUID();}
type Attempt={id:string;date:string;ranges:DnoteRange[];count:number};
export function WbAddDnotes({onClose,onSaved}:{onClose:()=>void;onSaved:(date:string,count:number)=>Promise<void>}){
 const [date,setDate]=useState(yesterday),[lines,setLines]=useState<DnoteRange[]>([{start:'',end:''}]);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const attempt=useRef<Attempt|null>(null),saving=useRef(false);
 const locked=busy||uncertain;
 function edit(i:number,key:keyof DnoteRange,value:string){setLines(old=>old.map((line,index)=>index===i?{...line,[key]:value}:line));attempt.current=null;setError('');}
 async function finish(a:Attempt){await onSaved(a.date,a.count);onClose();}
 async function save(){
  if(saving.current)return;
  let a:Attempt;
  try{a=attempt.current||{id:requestId(),...validateDnoteRanges(date,lines)};attempt.current=a;}
  catch(e){setError(e instanceof Error?e.message:'Check the date and D-Note ranges.');return;}
  saving.current=true;setBusy(true);setError('');
  try{
   const r=await supabase.rpc('wb_add_dnote_ranges',{p_request_id:a.id,p_date:a.date,p_ranges:a.ranges});
   if(!r.error&&r.data?.request_id===a.id){await finish(a);return;}
   // A transport failure may happen after commit. Verify this exact immutable request,
   // and retain its UUID while uncertain rather than generating a duplicate save.
   const verification=await supabase.from('wb_field_dnote_request').select('request_id,note_date,ranges').eq('request_id',a.id).maybeSingle();
   const savedRanges=verification.data?.ranges as DnoteRange[]|undefined;
   if(!verification.error&&verification.data?.note_date===a.date&&savedRanges?.length===a.ranges.length&&savedRanges.every((line,i)=>line.start===a.ranges[i].start&&line.end===a.ranges[i].end)){
    await finish(a);return;
   }
   const definitive=r.error?.code&&/^(P0001|23505|23503|23514|220\w\w|42501)$/.test(r.error.code);
   setUncertain(!definitive);
   if(definitive)attempt.current=null;
   setError((r.error?.message||'Save confirmation was not received.')+(!definitive?' Your entries are retained. Verify / retry sends the same request.':''));
  }catch(e){setUncertain(true);setError((e instanceof Error?e.message:'Save could not be verified.')+' Your entries are retained. Verify / retry sends the same request.');}
  finally{setBusy(false);saving.current=false;}
 }
 const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={{padding:12,borderRadius:6,backgroundColor:disabled?'#87988d':C.primary}}><Text style={{fontWeight:'700',color:'white'}}>{label}</Text></Pressable>;
 return <Modal visible animationType="fade" transparent onRequestClose={()=>{if(!busy)onClose();}}>
 <View style={{flex:1,backgroundColor:'#0008',justifyContent:'center',alignItems:'center',padding:20}}>
 <View style={{width:'100%',maxWidth:820,maxHeight:'95%',backgroundColor:C.surface,borderRadius:10,overflow:'hidden'}}>
  <View style={{backgroundColor:C.primaryDark,padding:16,flexDirection:'row',alignItems:'center',gap:16}}>
   <Image source={require('../../assets/images/jspl_farm_logo.png')} resizeMode="contain" style={{width:58,height:58,backgroundColor:'white',borderRadius:5}}/>
   <Text style={{flex:1,fontSize:24,fontWeight:'800',color:'white'}}>Add DNotes</Text>
   {button('Close',onClose,busy)}
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:22,gap:16}}>
   <View><Text style={{fontWeight:'700',marginBottom:6}}>Date</Text>
    <TextInput accessibilityLabel="D-Note date" editable={!locked} value={date} onChangeText={v=>{setDate(v);attempt.current=null;}} onBlur={()=>{const iso=wbParseDate(date);if(iso)setDate(wbFormatDate(iso));}} placeholder="dd/mm/yyyy" style={{borderWidth:1,borderColor:C.border,padding:12,borderRadius:6,width:220,fontSize:17}}/>
   </View>
   <Text>Enter one range per book. All lines use the date above.</Text>
   <View style={{flexDirection:'row',gap:12}}><Text style={{flex:1,fontWeight:'700'}}>D-Note start</Text><Text style={{flex:1,fontWeight:'700'}}>D-Note end</Text><View style={{width:80}}/></View>
   {lines.map((line,i)=><View key={i} style={{flexDirection:'row',gap:12,alignItems:'center'}}>
    {(['start','end'] as const).map(key=><TextInput key={key} accessibilityLabel={`Line ${i+1} D-Note ${key}`} editable={!locked} value={line[key]} onChangeText={v=>edit(i,key,v)} placeholder={key==='start'?'2/12':'2/22'} autoCorrect={false} style={{flex:1,borderWidth:1,borderColor:C.border,padding:12,borderRadius:6,fontSize:17}}/>)}
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove line ${i+1}`} disabled={locked||lines.length===1} onPress={()=>{setLines(old=>old.filter((_,index)=>index!==i));attempt.current=null;}} style={{width:80,padding:10,opacity:(locked||lines.length===1)?0.4:1}}><Text>Remove</Text></Pressable>
   </View>)}
   <View style={{alignItems:'flex-start'}}>{button('+ Add line',()=>{setLines(old=>[...old,{start:'',end:''}]);attempt.current=null;},locked||lines.length>=50)}</View>
   {error?<Text accessibilityRole="alert" style={{color:'#b42318',backgroundColor:'#fff0ee',padding:12,borderRadius:6}}>{error}</Text>:null}
  </ScrollView>
  <View style={{padding:16,borderTopWidth:1,borderColor:C.border,alignItems:'flex-end'}}>{button(busy?'Saving…':uncertain?'Verify / retry':'Save',()=>{void save();},busy)}</View>
 </View></View></Modal>;
}

