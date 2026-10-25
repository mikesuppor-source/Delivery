'use client'
import Link from 'next/link'
export function ShopifyOnboardingClient(){
 return <main className="content" style={{maxWidth:600,margin:'40px auto'}}>
 <h1>Connect your Shopify store</h1>
 <p>Create or sign in to your merchant account first. From the merchant portal, open the Shopify integration and authorize your store.</p>
 <p><Link className="btn btn-primary" href="/portal/signup">Create merchant account</Link>{' '}<Link className="btn btn-secondary" href="/portal/login">Sign in</Link></p>
 <p>Your store credentials are kept on the server. Customer orders are accepted only from verified Shopify webhooks.</p>
 </main>
}
