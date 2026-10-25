import { redirect } from 'next/navigation'
export default async function TrackPage({searchParams}:{searchParams:Promise<{code?:string}>}){
 const {code}=await searchParams
 if(code && /^[a-f0-9]{64}$/i.test(code))redirect('/track/'+code.toLowerCase())
 return <main className="content" style={{maxWidth:600,margin:'40px auto'}}><h1>Track your delivery</h1>
 <p>Open the private tracking link provided by your merchant. Phone-number searches are unavailable to protect customer privacy.</p>
 <form method="get"><label>Private tracking reference<input name="code" required maxLength={64} pattern="[a-fA-F0-9]{64}" /></label><button className="btn btn-primary">Track delivery</button></form></main>
}
