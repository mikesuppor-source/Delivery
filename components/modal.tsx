'use client'
import React,{useEffect,useRef,useId} from 'react'
interface ModalProps{isOpen:boolean;onClose:()=>void;title:string;children:React.ReactNode}
export function Modal({isOpen,onClose,title,children}:ModalProps){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId()
 useEffect(()=>{
  const dialog=ref.current
  if(!dialog)return
  if(isOpen){
   const previous=document.activeElement as HTMLElement|null
   dialog.showModal()
   const overflow=document.body.style.overflow;document.body.style.overflow='hidden'
   return ()=>{dialog.close();document.body.style.overflow=overflow;previous?.focus()}
  }
 },[isOpen])
 return <dialog ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current)onClose()}} style={{padding:0,border:0,borderRadius:12,maxWidth:'min(95vw,900px)'}}>
 <div className="modal"><div className="modal-title"><span id={titleId}>{title}</span><button onClick={onClose} className="icon-btn" aria-label="Close">✕</button></div>{children}</div>
 </dialog>
}
