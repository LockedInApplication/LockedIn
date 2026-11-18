import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('./DiscoveryShell',()=>({useDiscovery:()=>({userId:'viewer',me:{areas:[]},busy:false,setBusy:()=>{},setDirty:()=>{},confirmLeave:async()=>true})}));
vi.mock('./use-discovery-resource',()=>({useDiscoveryResource:()=>({value:{id:'public-profile',publicName:'Sam',avatarPreset:'sun',bio:'Public bio',intention:'LONG_TERM',interests:[],pace:null,areaId:'pilot-city',photos:[{id:'11111111-1111-4111-8111-111111111111',width:600,height:800,src:'/api/discovery/photos/11111111-1111-4111-8111-111111111111/media'}]},error:null,retry:()=>{}})}));
import ConnectedProfile from './ConnectedProfile';
it('offers reporting of the displayed public profile and photo, without new invitations',()=>{
  const html=renderToStaticMarkup(<ConnectedProfile connectionId="connection" onClose={()=>{}}/>);
  expect(html).toContain('Content to report');
  expect(html).toContain('value="PROFILE:public-profile"');
  expect(html).toContain('value="PHOTO:11111111-1111-4111-8111-111111111111"');
  expect(html).not.toContain('Reply to');expect(html).not.toContain('Start a conversation');
});
