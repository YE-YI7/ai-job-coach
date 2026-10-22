import HomeClient from '../HomeClient';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'益职 AI · 互动演示',robots:{index:false,follow:true}};
/** The original interactive sample stays available, without a model, account
 * write or payment. The four starting doors do not replace these capabilities. */
export default function DemoPage(){return <HomeClient/>;}
