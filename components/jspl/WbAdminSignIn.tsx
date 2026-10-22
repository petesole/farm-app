import {useEffect,useState} from "react";
import {View,Text,TextInput,Pressable} from "react-native";
import {supabase} from "../../supabase";
import {jsplColors as C} from "../../constants/jspl-design";

/** Weighbridge requires Supabase Auth, independently of the legacy farm app login. */
export function WbAdminSignIn({onAuthenticated}:{onAuthenticated:()=>void}){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [currentEmail,setCurrentEmail]=useState("");
 useEffect(()=>{let live=true;supabase.auth.getUser().then(({data})=>{if(live)setCurrentEmail(data.user?.email||"")});return()=>{live=false}},[]);
 const checkAccess=async()=>{setBusy(true);setMessage("");try{const {data,error}=await supabase.rpc("wb_admin_allowed");if(!error&&data===true){onAuthenticated();return;}setMessage(error?.message||"This account does not have Weighbridge Admin permission. Ask an administrator to assign it.");}finally{setBusy(false)}};
 const switchAccount=async()=>{setBusy(true);await supabase.auth.signOut();setCurrentEmail("");setBusy(false);setMessage("");};
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
   setCurrentEmail(auth.user.email||"");onAuthenticated();
  }catch(e:any){setMessage(e?.message||"Unable to sign in.");}
  finally{setBusy(false);setPassword("");}
 };
 return <View style={{maxWidth:440,margin:30,padding:22,borderRadius:9,backgroundColor:C.surface}}>
  <Text style={{fontSize:21,fontWeight:"bold",color:C.primaryDark,marginBottom:8}}>Weighbridge Admin sign in</Text>
  <Text style={{marginBottom:16}}>Weighbridge permissions are checked against your signed-in Supabase account.</Text>
  {currentEmail?<View style={{marginBottom:16}}><Text style={{fontWeight:"bold",marginBottom:8}}>Signed in as {currentEmail}</Text><Pressable disabled={busy} onPress={checkAccess} style={{padding:10,backgroundColor:C.primaryDark,borderRadius:5,marginBottom:8}}><Text style={{color:"white"}}>Recheck Weighbridge access</Text></Pressable><Pressable disabled={busy} onPress={switchAccount}><Text style={{textDecorationLine:"underline"}}>Sign in with a different account</Text></Pressable></View>:null}
  {!currentEmail?<View>
  <Text style={{marginBottom:4}}>Email</Text>
  <TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{borderWidth:1,borderColor:"#bbb",borderRadius:5,padding:10,marginBottom:12}}/>
  <Text style={{marginBottom:4}}>Password</Text>
  <TextInput secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={login} style={{borderWidth:1,borderColor:"#bbb",borderRadius:5,padding:10,marginBottom:12}}/>
  <Pressable disabled={busy||!email.trim()||!password} onPress={login} style={{backgroundColor:C.primaryDark,padding:12,borderRadius:5,opacity:busy?0.6:1}}><Text style={{color:"white",textAlign:"center",fontWeight:"bold"}}>{busy?"Signing in…":"Sign in to Weighbridge"}</Text></Pressable>
  </View>:null}
  {message?<Text style={{marginTop:12,color:"#b42318"}}>{message}</Text>:null}
 </View>;
}
