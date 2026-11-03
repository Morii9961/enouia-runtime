// Controlled transport examples, not saved native/Core evidence.
export const filter = { text:'',form:null,state:null,knowledge:null,adoption:null,validity:null,attention:null,entity:null,project:null,theme:null,time_axis:null,time_window:null,include_unknown_time:false };
export const selection = { algorithm:'owner-qualified-catalog-4',version:4,profile_hash:'a'.repeat(64),withdrawal_watermark:1,
  snapshot:{vault_id:'synthetic-vault',base_commit_id:'synthetic-commit',primary_epoch:1,policy_watermark:1,deletion_watermark:1},
  scope_hash:'b'.repeat(64),query_hash:'c'.repeat(64),evaluated_at:'2026-11-03T00:00:00.000Z' };
export const envelope = {schema_version:2,capability:'memory-native-read-2',effect:'native_read'};
export const status = (state='open') => ({...envelope,kind:'runtime_memory_catalog_status',mode:'synthetic_segmented_only',state,available:state==='open',...(state==='open'?{selection}:{} )});
export function page(text='',cursor=null) {
  const chosen={...selection,query_hash:(text?'d':'c').repeat(64)};
  const ids=text?[2]:cursor?[3]:[1,2];
  return {...envelope,kind:'catalog_memory_page',selection:chosen,authorized_at:selection.evaluated_at,count_exact:true,scope:'authorized_current_machine_revisions',matched_in_scope:text?1:3,unknown_time_in_scope:text?1:3,
    items:ids.map(n=>({title:n===2?'调试偏好':`Synthetic item ${n}`,content_lang:n===2?'zh-Hans':'en',base:{memory:{memory_id:`synthetic-memory-${n}`,revision:1},content:n===2?'合成示例：我喜欢详细的调试说明。':'Synthetic text <img id="catalog-injected" src="invalid">',system_actor:{actor_type:'system'},dimensions:{kind:'preference'},knowledge:'self_report',adoption:'adopted',validity:'unspecified',attention:'active'}})),
    complete_in_scope:!!text||!!cursor,next:text||cursor?null:{selection:chosen,after:'synthetic-memory-2'},facets:[]};
}
export const stats = (selected=selection,matched=3) => ({...envelope,kind:'catalog_memory_stats',selection:selected,authorized_at:selection.evaluated_at,count_exact:true,scope:'authorized_current_machine_revisions',matched_in_scope:matched,groups:[],theme_membership:'authorized'});
