import {prepareJourneyEvent} from "./product-journey-events";
import {summarizeProductJourneys} from "./product-journey-analytics";
import type {AnalyticsEvent} from "./admin-analytics";
const id="12345678-1234-4234-9234-123456789abc", gen=`${id}:4`;
test("landing records IDs and response kind, never the sentence or response",()=>{
  expect(prepareJourneyEvent("landing_response_presented",{journey_id:id,response_source:"fallback",message:"私密内容",reply:"回复"}))
    .toEqual({schema_version:2,journey_id:id,response_source:"fallback"});
  expect(prepareJourneyEvent("landing_message_submitted",{journey_id:"bad"})).toBeNull();
});
test("export allows only finite metadata, legacy stays unlinked",()=>{
  expect(prepareJourneyEvent("resume_export_clicked",{export_id:id,generation_id:gen,resumeText:"正文",pdf:"base64"}))
    .toEqual({schema_version:2,export_id:id,generation_id:gen,linkage:"generation"});
  expect(prepareJourneyEvent("resume_preview_ready",{})).toEqual({schema_version:2,linkage:"unlinked"});
});
test("same owner and generation links stages without attributing another account or claiming file saved",()=>{
  const row=(name:string,extra:Partial<AnalyticsEvent>={}):AnalyticsEvent=>({id:name,user_id:"a",event_identity:"a",
    event_name:name,created_at:"2026-11-17T00:00:00Z",generation_id:gen,...extra});
  const s=summarizeProductJourneys([
    row("resume_task_started"),row("resume_document_persisted"),row("resume_result_presented"),
    row("resume_change_decided",{change_id:"change-1234"}),row("resume_change_decided",{change_id:"change-1234"}),
    row("resume_export_clicked",{export_id:id}),row("resume_preview_ready",{export_id:id}),
    row("resume_print_requested",{export_id:id}),row("resume_print_dialog_closed",{export_id:id}),
    row("resume_export_clicked",{user_id:"b",export_id:id}),row("resume_export_clicked",{generation_id:null}),
  ]);
  expect(s.generations).toHaveLength(2);
  expect(s.generations[0]).toMatchObject({started:true,persisted:true,presented:true,decisions:1,exports:1,previews:1,printRequests:1,dialogReturns:1});
  expect(s.generations[1]).toMatchObject({presented:false,persisted:false});
  expect(s.unlinkedExports).toBe(1);expect(JSON.stringify(s)).not.toMatch(/fileSaved|downloadSuccess/);
});
