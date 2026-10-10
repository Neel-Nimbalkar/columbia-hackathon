import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
export const metadata:Metadata={title:'RudCo — RFQ to Quote',description:'Turn industrial RFQs into explainable supplier quotations.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={GeistSans.className}>{children}</body></html>;}
