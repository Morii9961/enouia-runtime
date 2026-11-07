// Invented snapshots for browser comparison only. Not a Memory schema or saved history.
import type {AutoMemory} from './fixture';
export const REVISION_SNAPSHOTS = [
  {memoryId:'demo_revision_01',revision:'r1',text:'Use a full planning summary.',recorded:'2026-10-10T08:00:00Z'},
  {memoryId:'demo_revision_01',revision:'r2',text:'Use a short planning summary.',recorded:'2026-10-11T08:00:00Z'},
  {memoryId:'demo_revision_01',revision:'r3',text:'Use a short daily planning summary.',recorded:'2026-10-12T08:00:00Z'},
];
export const REVISION_MEMORIES:AutoMemory[]=[{
  id:'demo_revision_01',kind:'preference',title:'Invented planning summary',statement:REVISION_SNAPSHOTS[2].text,
  state:'adopted',rev:'r3',themes:[],occurred:{precision:'unknown'},
  valid:{from:null,to:null,note:'No validity window recorded'},
  received:'2026-10-10T07:50:00Z',known:'2026-10-10T08:00:00Z',revised:'2026-10-12T08:00:00Z',
  why:'Invented current body. Previous bodies are separate invented snapshots, not reconstructed from notes.',
  support:[{source:'Invented summary note',role:'imported note',rev:'src r3',excerpt:'Use a short daily planning summary.',received:'2026-10-12T07:50:00Z'}],
  contextDeps:[],surfacing:'sometimes',
  trail:[{at:'2026-10-10T07:50:00Z',step:'received',note:'Invented first note received.'},
    {at:'2026-10-10T08:00:00Z',step:'adopted',note:'Invented first body adopted.'},
    {at:'2026-10-12T08:00:00Z',step:'consolidated',note:'Invented current wording. This note is not a revision body or receipt.'}],
}];
