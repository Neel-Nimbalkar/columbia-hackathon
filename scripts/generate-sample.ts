import { mkdir,writeFile } from 'node:fs/promises';
import { generateQuotePdf } from '../src/lib/server/pdf';
import { makeDemoQuote } from '../src/lib/demo/fixtures';
async function main(){await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/rudco-sample.pdf',await generateQuotePdf(makeDemoQuote('successful'),true));console.log('Created output/pdf/rudco-sample.pdf');}main();
