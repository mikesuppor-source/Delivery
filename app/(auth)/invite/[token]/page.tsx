'use client'
import { useEffect,useState } from 'react'
import { useParams,useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
export default function InvitePage(){
 const {token}=useParams<{token:string}>(),router=useRouter()
 const [invite,setInvite]=useState<{email:string;role:string}|null>(null)
 const [password,setPassword]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [hasSession,setHasSession]=useState(false)
 useEffect(()=>{
  async function load(){
   try{
    const client=createClient(),url=new URL(window.location.href),hash=new URLSearchParams(url.hash.slice(1))
    if(url.searchParams.get('code')){
     const result=await client.auth.exchangeCodeForSession(url.searchParams.get('code')!)
     if(result.error)throw result.error
     window.history.replaceState(null,'',url.pathname)
    }else if(hash.get('access_token')&&hash.get('refresh_token')){
     const result=await client.auth.setSession({access_token:hash.get('access_token')!,refresh_token:hash.get('refresh_token')!})
     if(result.error)throw result.error
     window.history.replaceState(null,'',url.pathname)
    }
    const response=await fetch('/api/invite/preview?token='+encodeURIComponent(token))
    const data=await response.json()
    if(!response.ok)throw new Error(data.error)
    setInvite(data.invitation)
    const {data:{user}}=await client.auth.getUser()
    setHasSession(user?.email?.toLowerCase()===data.invitation.email.toLowerCase())
   }catch(e){setError(e instanceof Error?e.message:'Unable to load invitation')}
  }void load()
 },[token])
 async function accept(e:React.FormEvent){
  e.preventDefault();if(!invite)return;setBusy(true);setError('')
  try{
   const client=createClient()
   const result=hasSession?await client.auth.updateUser({password}):await client.auth.signInWithPassword({email:invite.email,password})
   if(result.error)throw result.error
   const response=await fetch('/api/invite/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,displayName:name})})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error)
   router.push('/');router.refresh()
  }catch(e){setError(e instanceof Error?e.message:'Unable to accept invitation')}finally{setBusy(false)}
 }
 return <main className="content" style={{maxWidth:500,margin:'40px auto'}}><h1>Accept staff invitation</h1>
 {error&&<p role="alert">{error}</p>}
 {invite&&<form onSubmit={accept}><p>{invite.email} — {invite.role}</p>
 <label>Your name<input required value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>{hasSession?'Set your password':'Your existing account password'}<input type="password" required minLength={hasSession?10:1} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {!hasSession&&<p>New staff: open the invitation email first to verify your account.</p>}
 <button disabled={busy} className="btn btn-primary">{busy?'Saving…':'Accept invitation'}</button></form>}</main>
}
