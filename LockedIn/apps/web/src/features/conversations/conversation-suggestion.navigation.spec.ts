import {describe,expect,it} from 'vitest';
import {notificationDestination} from '../notifications/notification.navigation';
import {workspaceViewUrl} from '../journey/journey.navigation';
describe('focused conversation navigation',()=>{
 it('opens the exact notification instead of a generic topic list',()=>{expect(notificationDestination({id:'42',view:'conversations',entityId:'pair',wordKey:null})).toBe('/journey?view=conversations&suggestion=42');});
 it('clears stale suggestion focus when leaving conversations',()=>{expect(workspaceViewUrl('/journey?view=conversations&suggestion=42','home')).toBe('/journey');});
});
