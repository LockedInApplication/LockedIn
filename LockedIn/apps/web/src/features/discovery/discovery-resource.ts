export class DiscoveryResource<T> {
  private controller:AbortController|null=null;
  async load(owner:string,key:string,read:(signal:AbortSignal)=>Promise<T>,install:(value:T)=>void,error:(error:unknown)=>void) {
    this.dispose();if(!owner || !key)return;
    const controller=new AbortController();this.controller=controller;
    try{const value=await read(controller.signal);if(this.controller===controller && !controller.signal.aborted)install(value);}
    catch(cause){if(this.controller===controller && !controller.signal.aborted)error(cause);}
  }
  dispose() {this.controller?.abort();this.controller=null;}
}
export function currentDiscoveryValue<T>(owner:string,key:string,state:{owner:string;key:string;value:T}|null):T|null{return state?.owner===owner && state.key===key?state.value:null;}
