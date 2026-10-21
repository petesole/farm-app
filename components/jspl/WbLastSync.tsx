import {useEffect,useState} from "react";
import {Text} from "react-native";
import {supabase} from "../../supabase";
/** Latest successfully uploaded WB-computer slip (Zimbabwe local time, DD/MM/YYYY HH:mm). */
export function WbLastSync({refreshKey=0}:{refreshKey?:number}){
 const [stamp,setStamp]=useState<string|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;(async()=>{const r=await supabase.from("wb_scale_transaction").select("synced_at").not("synced_at","is",null).order("synced_at",{ascending:false}).limit(1);if(!active)return;if(r.error){setError(true);return;}setError(false);setStamp(r.data?.[0]?.synced_at||null)})();return()=>{active=false}},[refreshKey]);
 let display="No sync recorded";
 if(error)display="Sync status unavailable";
 else if(stamp){const d=new Date(stamp);if(!Number.isNaN(d.getTime())){const fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Harare",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});display=fmt.format(d).replace(",","");}}
 return <Text style={{color:"#dce9dc",fontSize:12,fontWeight:"600",marginHorizontal:12}}>Last WB sync: {display}</Text>;
}