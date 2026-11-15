import {expect,it,vi} from 'vitest';
vi.mock('../../lib/prisma.js',()=>({prisma:{}}));
vi.mock('../notifications/index.js',()=>({withNotifications:async()=>{throw new Error('This shared space is no longer available.')}}));
vi.mock('../journey-notifications/journey-email.service.js',()=>({sendJourneyEmailSafely:async()=>{}}));
import {performConversationChoice} from './conversation-choice.action.js';
it('turns an ended-space acceptance race into a conflict result',async()=>{await expect(performConversationChoice({} as never,{id:'b'},'pair','direction',1n)).resolves.toMatchObject({error:expect.any(String)});});
