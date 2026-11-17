"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname,useRouter} from "next/navigation";
import {authClient} from "@/utils/authCLient";
import WorkspaceHeader from "@/features/journey/components/WorkspaceHeader";
import {NotificationBell,notificationDestination} from "@/features/notifications";
import ConfirmDialog from "@/components/ConfirmDialog";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import {useDiscoveryNavigation} from "./use-discovery-navigation";
import type {DiscoveryMe} from "./discovery.types";
import styles from "./discovery.module.scss";
import {checkEmailVerification} from "@/features/auth/email-verification";
type DiscoveryContext={userId:string;emailVerified:boolean|null;me:DiscoveryMe;refreshAccess:()=>void;leave:(path:string)=>Promise<boolean>;dirty:boolean;setDirty:(value:boolean)=>void;busy:boolean;setBusy:(value:boolean)=>void;confirmLeave:()=>Promise<boolean>;chatRevision:number};
const Context=createContext<DiscoveryContext|null>(null);
export function useDiscovery(){const value=useContext(Context);if(!value)throw new Error("Discovery account context required");return value;}
export default function DiscoveryShell({children}:{children:ReactNode}){
  const session=authClient.useSession(),router=useRouter(),path=usePathname();
  useEffect(()=>{if(!session.isPending&&!session.data?.user)router.replace(`/login?returnTo=${encodeURIComponent(path)}`);},[session.isPending,session.data?.user,router,path]);
  if(session.isPending||!session.data?.user)return <main className={styles.main}><p role="status">Opening your space…</p></main>;
  return <AccountShell key={session.data.user.id} userId={session.data.user.id} name={session.data.user.name||"Your account"}>{children}</AccountShell>;
}
function AccountShell({userId,name,children}:{userId:string;name:string;children:ReactNode}){
  const path=usePathname(),router=useRouter(),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[activity,setActivity]=useState(false),[signOutError,setSignOutError]=useState("");
  const initialStream=useRef(true);
  const onActivity=useCallback(()=>setActivity(true),[]);
  const [chatRevision,setChatRevision]=useState(0);
  const onChatSync=useCallback(()=>setChatRevision(value=>value+1),[]);
  const onStatusChange=useCallback((hasActivity?:boolean)=>{if(initialStream.current){initialStream.current=false;if(!hasActivity)return;}setActivity(true);},[]);
  const onExpired=useCallback(()=>router.replace(`/login?returnTo=${encodeURIComponent(path)}`),[router,path]);
  const navigation=useDiscoveryNavigation(dirty||busy,path);
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<DiscoveryMe>(userId,"/api/discovery/me",{signal}),[userId]);
  const me=useDiscoveryResource(userId,"me",load);
  const loadVerification=useCallback(()=>checkEmailVerification(userId),[userId]);
  const verification=useDiscoveryResource(userId,"email-verification",loadVerification);
  const leave=async(destination:string)=>busy?false:navigation.leave(destination);
  const confirmActionDiscard=async()=>{const allowed=await navigation.confirmLeave();navigation.resetApproval();return allowed;};
  const signOut=async()=>{if(busy||!await navigation.confirmLeave())return;try{const result=await authClient.signOut();if(result.error)throw new Error("Could not sign out. Please try again.");router.replace("/login");}catch(error){navigation.resetApproval();setSignOutError(error instanceof Error?error.message:"Could not sign out.");}};
  return <div className={styles.page}>
    <WorkspaceHeader user={{name}} onSignOut={signOut} onHome={()=>void leave("/journey")} onProfile={()=>void leave("/profile")} onInvitations={()=>void leave("/journey?invitations=manage")} notifications={<NotificationBell userId={userId} onOpen={item=>leave(notificationDestination(item))} onActivity={onActivity} onStatusChange={onStatusChange} onExpired={onExpired} onChatSync={onChatSync}/>}/>
    <main className={styles.main}>
      {signOutError?<p role="alert">{signOutError}</p>:null}
      {me.error?<section role="alert"><p>{me.error}</p><button onClick={me.retry}>Try again</button></section>:null}
      {!me.value&&!me.error?<p role="status">Loading your discovery access…</p>:null}
      {me.value?<Context.Provider value={{userId,emailVerified:verification.value?.emailVerified??null,me:me.value,refreshAccess:me.retry,leave,dirty,setDirty,busy,setBusy,confirmLeave:confirmActionDiscard,chatRevision}}><nav className={styles.nav} aria-label="Your spaces"><button onClick={()=>void leave("/journey")}>My LockedIn</button>{me.value.canDiscover?<button onClick={()=>void leave("/discover")}>Discover</button>:null}{me.value.canDiscover||me.value.hasHistory?<><button onClick={()=>void leave("/connections")}>Connections</button><button onClick={()=>void leave("/your-space")}>Your space</button></>:null}{me.value.canModerate?<button onClick={()=>void leave("/discovery/moderation")}>Moderation</button>:null}</nav>{activity?<aside className={styles.notice}><p>Updates are available. Your unfinished text has not changed.</p><button disabled={busy} onClick={async()=>{if(await navigation.confirmLeave()){setDirty(false);router.refresh();window.location.reload();}}}>Refresh when ready</button></aside>:null}{children}</Context.Provider>:null}
    </main>
    <ConfirmDialog {...navigation.dialog} title="Leave this unfinished draft?" description="Only text you explicitly saved is kept. Nothing will be shared by leaving." confirmLabel="Leave draft" cancelLabel="Keep editing"/>
  </div>;
}
