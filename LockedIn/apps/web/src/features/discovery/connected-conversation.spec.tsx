import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import type {DiscoveryConnectionView} from './discovery.types';
const state=vi.hoisted(()=>({connection:{} as DiscoveryConnectionView,currentRelationshipId:'relationship' as string|null}));
vi.mock('./DiscoveryShell',()=>({default:({children}:{children:React.ReactNode})=>children,useDiscovery:()=>({userId:'viewer',me:{canDiscover:false,canChat:true,chatEnabled:true,areas:[],currentRelationshipId:state.currentRelationshipId},refreshAccess:()=>{},leave:async()=>true,setDirty:()=>{},busy:false,setBusy:()=>{},confirmLeave:async()=>true,chatRevision:0})}));
// Server-resource boundary: render a loaded accepted/promoted connection, not a fake chat.
vi.mock('./use-discovery-resource',()=>({useDiscoveryResource:()=>({value:state.connection,error:null,retry:()=>{}})}));
import ConnectionPage from './ConnectionPage';
beforeEach(()=>{state.currentRelationshipId='relationship';state.connection={id:'connection',state:'ACCEPTED',topic:{key:'support',text:'A question'},hello:'Hello',inviter:'self',senderSnapshot:{publicName:'Me',avatarPreset:'sun'},partner:{publicName:'Sam',avatarPreset:'sun'},ownDraft:null,sharedResponses:[],readiness:{mine:false,theirs:false,consentVersion:1},promotedRelationshipId:null,canAccept:false,canShare:false,canClose:true,canChooseBuild:true,canChat:true};});
it.each(['ACCEPTED','PROMOTED'] as const)('renders chat when Discovery is paused and the %s connection still permits chat',stateName=>{
  state.connection={...state.connection,state:stateName,lockedIn:stateName==='PROMOTED'};
  const html=renderToStaticMarkup(<ConnectionPage connectionId="connection"/>);
  expect(html).toContain('aria-label="Discovery chat"');
  expect(html).not.toContain('Messaging is currently unavailable');
  expect(html).toContain('aria-label="View Sam’s profile"');
});
it('does not offer partner-profile viewing or chat for closed connections',()=>{
  state.connection={...state.connection,state:'CLOSED',canChat:false,canClose:false};
  const html=renderToStaticMarkup(<ConnectionPage connectionId="connection"/>);
  expect(html).not.toContain('aria-label="Discovery chat"');
  expect(html).not.toContain('aria-label="View Sam’s profile"');
});
it('preserves decline and report for a received invitation that cannot be accepted',()=>{
  state.connection={...state.connection,state:'PENDING',inviter:'partner',canChat:false,canAccept:false};
  const html=renderToStaticMarkup(<ConnectionPage connectionId="connection"/>);
  expect(html).toContain('Decline quietly');
  expect(html).toContain('Safety &amp; contact controls');
  expect(html).toContain('This invitation can’t be accepted right now.');
  expect(html).not.toContain('Accept and chat');
  expect(html).not.toContain('Your invitation has been sent.');
});
it('explains an ended shared space without offering chat or navigation to it',()=>{
  state.currentRelationshipId=null;
  state.connection={...state.connection,state:'PROMOTED',lockedIn:true,promotedRelationshipId:'relationship',canChat:false};
  const html=renderToStaticMarkup(<ConnectionPage connectionId="connection"/>);
  expect(html).toContain('Shared space ended');
  expect(html).toContain('Messaging is unavailable for this connection.');
  expect(html).not.toContain('Your existing chats remain available');
  expect(html).not.toContain('Use My LockedIn for your current shared space');
  expect(html).not.toContain('aria-label="Discovery chat"');
  expect(html).not.toContain('Open our shared space');
});
it('does not call an active shared space ended when its chat is restricted',()=>{
  state.connection={...state.connection,state:'PROMOTED',lockedIn:true,promotedRelationshipId:'relationship',canChat:false};
  const html=renderToStaticMarkup(<ConnectionPage connectionId="connection"/>);
  expect(html).not.toContain('Shared space ended');
  expect(html).not.toContain('Your existing chats remain available');
  expect(html).toContain('Open our shared space');
  expect(html).not.toContain('aria-label="Discovery chat"');
});
