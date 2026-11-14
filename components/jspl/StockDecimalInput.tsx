import {useState} from 'react';
import {TextInput,TextInputProps} from 'react-native';

// Format the resting display without rounding the underlying input or calculations.
export function StockDecimalInput(props:TextInputProps){
 const [editing,setEditing]=useState(false);
 const value=props.value?.trim();
 const display=!editing&&value&&Number.isFinite(Number(value))?Number(value).toFixed(3):props.value;
 return <TextInput {...props} value={display} onFocus={e=>{setEditing(true);props.onFocus?.(e)}} onBlur={e=>{setEditing(false);props.onBlur?.(e)}}/>;
}
