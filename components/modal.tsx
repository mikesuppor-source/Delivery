'use client'

import React, { useEffect, useRef, useId } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'min(92vw, 740px)' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (isOpen) {
      const previous = document.activeElement as HTMLElement | null
      if (!dialog.open) {
        dialog.showModal()
      }
      const overflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        if (dialog.open) dialog.close()
        document.body.style.overflow = overflow
        previous?.focus()
      }
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
      onClick={e => {
        if (e.target === ref.current) onClose()
      }}
      style={{
        margin: 'auto',
        border: 'none',
        background: 'transparent',
        padding: 0,
        borderRadius: 16,
        maxWidth,
        width: '100%',
        outline: 'none',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div className="modal" style={{ maxWidth: '100%', width: '100%', borderRadius: 16 }}>
        <div className="modal-title">
          <span id={titleId}>{title}</span>
          <button onClick={onClose} className="icon-btn" aria-label="Close" type="button">
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
