import {Dispatch,SetStateAction} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SheetItem,sortStockItems,stockCategory,stockGroup} from '@/utils/stock-sheet';
import {StockButton,stockStyles as S} from './StockWorkflowControls';
export function StocktakeSelection({items,selected,onSelection,search,onSearch,disabled=false}:{items:SheetItem[];selected:Record<string,boolean>;onSelection:Dispatch<SetStateAction<Record<string,boolean>>>;search:string;onSearch:(v:string)=>void;disabled?:boolean}){
 const sorted=sortStockItems(items),groups=[...new Set(items.map(stockGroup))].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
 const shown=sorted.filter(x=>(x.item_code+' '+x.item_name+' '+stockCategory(x)+' '+stockGroup(x)).toLowerCase().includes(search.toLowerCase()));
 return <View style={{gap:12}}><Text style={S.text}>Choose stock groups, or tick individual items. You can combine Chemical, Fertilizer and other groups.</Text>
 <View style={S.row}>{groups.map(group=>{const rows=items.filter(x=>stockGroup(x)===group),count=rows.filter(x=>selected[x.item_code]).length,all=count===rows.length;return <Pressable key={group} disabled={disabled} accessibilityRole="checkbox" accessibilityLabel={'Stock group: '+group} accessibilityState={{checked:all?true:count?'mixed':false}} style={S.card} onPress={()=>onSelection(old=>({...old,...Object.fromEntries(rows.map(x=>[x.item_code,!all]))}))}><Text>{all?'☑':count?'▣':'☐'} {group} ({count}/{rows.length})</Text></Pressable>})}</View>
 <View style={S.row}><StockButton title="Select All In-Stock Items" disabled={disabled} onPress={()=>onSelection(Object.fromEntries(items.map(x=>[x.item_code,true])))}/><StockButton title="Clear Selection" disabled={disabled} onPress={()=>onSelection({})}/></View>
 <TextInput accessibilityLabel="Search stock items" style={S.input} placeholder="Search category or product" value={search} onChangeText={onSearch}/>
 <Text style={S.muted}>{items.filter(x=>selected[x.item_code]).length} selected · {shown.length} displayed · Category A–Z, then product A–Z</Text>
 <ScrollView horizontal><View style={{minWidth:680,flex:1}}><View style={[S.row,{flexWrap:'nowrap',padding:10}]}><Text style={{width:45}}>✓</Text><Text style={{width:160}}>Category</Text><Text style={{flex:1}}>Product</Text><Text style={{width:85}}>Unit</Text></View>
 {shown.map(x=><Pressable key={x.item_code} disabled={disabled} accessibilityRole="checkbox" accessibilityLabel={'Count '+x.item_name} accessibilityState={{checked:!!selected[x.item_code]}} style={[S.row,{flexWrap:'nowrap',padding:10,borderBottomWidth:1,borderColor:'#d3ddd6'}]} onPress={()=>onSelection(old=>({...old,[x.item_code]:!old[x.item_code]}))}><Text style={{width:45}}>{selected[x.item_code]?'☑':'☐'}</Text><Text style={{width:160}}>{stockCategory(x)}</Text><View style={{flex:1}}><Text>{x.item_name}</Text><Text style={S.muted}>{stockGroup(x)} · {x.item_code}</Text></View><Text style={{width:85}}>{x.base_unit}</Text></Pressable>)}
 </View></ScrollView></View>;
}
