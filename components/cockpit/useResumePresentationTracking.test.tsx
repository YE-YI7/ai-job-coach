import {act,create} from "react-test-renderer";
import {useResumePresentationTracking} from "./useResumePresentationTracking";
import {trackProductEvent} from "@/lib/product-events";
jest.mock("@/lib/product-events",()=>({trackProductEvent:jest.fn()}));
function Fixture({gen,visible}:{gen?:string;visible:boolean}){useResumePresentationTracking(gen,visible);return null;}
test("saved-document readback can report a visible generation without waiting for task receipt; rerenders deduplicate",async()=>{
  const track=trackProductEvent as jest.Mock;track.mockClear();let tree!:ReturnType<typeof create>;
  await act(async()=>{tree=create(<Fixture gen="task:4" visible={false}/>);});
  expect(track).not.toHaveBeenCalled();
  await act(async()=>{tree.update(<Fixture gen="task:4" visible/>);});
  await act(async()=>{tree.update(<Fixture gen="task:4" visible/>);});
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith("resume_result_presented",{generation_id:"task:4"});
  await act(async()=>{tree.update(<Fixture gen="task:5" visible/>);});
  expect(track).toHaveBeenCalledTimes(2);
  await act(async()=>{tree.unmount();});
});
