import {useState} from "react";
import {View,Text,TextInput,Pressable} from "react-native";
import {supabase} from "../../supabase";
import {jsplColors as C} from "../../constants/jspl-design";

/** Weighbridge requires Supabase Auth, independently of the legacy farm app login. */
export function WbAdminSignIn({onAuthenticated}:{onAuthenticated:()=>void}){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const login=async()=>{
  if(busy||!email.trim()||!password)return;
  setBusy(true);setMessage("");
  try{
   const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(error){setMessage(error.message);return;}
   const role=await supabase.rpc("wb_admin_allowed");
   if(role.error||role.data!==true){
    await supabase.auth.signOut();
    setMessage(role.error?.message||"This account does not have Weighbridge Admin access.");
    return;
   }
   onAuthenticated();
  }catch(e:any){setMessage(e?.message||"Unable to sign in.");}
  finally{setBusy(false);setPassword("");}
 };
 return <View style={{maxWidth:440,margin:30,padding:22,borderRadius:9,backgroundColor:C.surface}}>
  <Text style={{fontSize:21,fontWeight:"bold",color:C.primaryDark,marginBottom:8}}>Weighbridge Admin sign in</Text>
  <Text style={{marginBottom:16}}>Use your Supabase Authentication email and password. The normal farm app login is separate.</Text>
  <Text style={{marginBottom:4}}>Email</Text>
  <TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{borderWidth:1,borderColor:"#bbb",borderRadius:5,padding:10,marginBottom:12}}/>
  <Text style={{marginBottom:4}}>Password</Text>
  <TextInput secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={login} style={{borderWidth:1,borderColor:"#bbb",borderRadius:5,padding:10,marginBottom:12}}/>
  <Pressable disabled={busy||!email.trim()||!password} onPress={login} style={{backgroundColor:C.primaryDark,padding:12,borderRadius:5,opacity:busy?0.6:1}}><Text style={{color:"white",textAlign:"center",fontWeight:"bold"}}>{busy?"Signing in…":"Sign in to Weighbridge"}</Text></Pressable>
  {message?<Text style={{marginTop:12,color:"#b42318"}}>{message}</Text>:null}
 </View>;
}
