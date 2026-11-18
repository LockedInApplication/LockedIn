"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {currentDiscoveryValue,DiscoveryResource} from "./discovery-resource";
export function useDiscoveryResource<T>(owner:string,key:string,load:(signal:AbortSignal)=>Promise<T>){
  const resource=useRef<DiscoveryResource<T>|null>(null);
  if(resource.current===null)resource.current=new DiscoveryResource<T>();
  const [state,setState]=useState<{owner:string;key:string;value:T}|null>(null);
  const [failure,setFailure]=useState<{owner:string;key:string;value:string}|null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const instance=resource.current!;
    void instance.load(owner,key,load,value=>{setState({owner,key,value});setFailure(null);},error=>setFailure({owner,key,value:error instanceof Error?error.message:"We could not load this space."}));
    return()=>instance.dispose();
  },[owner,key,load,revision]);
  const install=useCallback((value:T)=>{resource.current?.dispose();setState({owner,key,value});setFailure(null);},[owner,key]);
  const retry=useCallback(()=>setRevision(value=>value+1),[]);
  return{value:currentDiscoveryValue(owner,key,state),error:currentDiscoveryValue(owner,key,failure),retry,install};
}
