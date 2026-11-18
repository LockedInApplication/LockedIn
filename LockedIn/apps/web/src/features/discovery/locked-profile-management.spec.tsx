import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({profile:{publicName:'Sam',avatarPreset:'sun' as const,bio:'Published introduction',intention:'LONG_TERM' as const,interests:[],pace:null,areaId:'pilot-city',photoIds:[]},me:{canDiscover:false,canManageProfile:true,canChat:true,discoveryLockedIn:true,photos:{enabled:true,configured:true},areas:[{id:'pilot-city',label:'Pilot city'}]}}));
vi.mock('./DiscoveryShell',()=>({default:({children}:{children:React.ReactNode})=>children,useDiscovery:()=>({userId:'owner',me:fixture.me,setDirty:()=>{},dirty:false,busy:false,setBusy:()=>{}})}));
vi.mock('./use-discovery-resource',()=>({useDiscoveryResource:()=>({value:{draft:fixture.profile,published:{...fixture.profile,id:'profile'},revision:1,publicationVersion:1,paused:true,adultAttested:true,suspended:false},error:null,retry:()=>{},install:()=>{}})}));
import DiscoveryProfilePage from './DiscoveryProfilePage';
import DiscoveryPhotoEditor from './photos/DiscoveryPhotoEditor';
it('keeps published-profile preview and editing available while lock-in prevents resuming Discovery',()=>{
  const html=renderToStaticMarkup(<DiscoveryProfilePage/>);
  expect(html).toContain('aria-label="Published Discovery profile"');
  expect(html).toContain('Edit profile');expect(html).toContain('Published introduction');
  expect(html).toContain('Existing connections can still see your published profile');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Resume visibility/);
  expect(html).not.toContain('Your saved data stays private');
});
it('does not disable owner photo management merely because Discovery is locked in',()=>{
  const html=renderToStaticMarkup(<DiscoveryPhotoEditor profile={{draft:fixture.profile,published:null,revision:1,publicationVersion:0,paused:true,adultAttested:true,suspended:false}} install={()=>{}}/>);
  expect(html).toContain('Choose photo');expect(html).toContain('type="file"');
});
