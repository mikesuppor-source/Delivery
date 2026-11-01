import { LegalPage, contactLine, legalHeading } from '@/components/legal-page'

export const metadata = {
  title: 'Terms of Service | Cedar Delivery Desk',
  description: 'The terms for using Cedar Delivery Desk.',
}

export default function TermsPage() {
  const contact = contactLine(process.env.NEXT_PUBLIC_CONTACT_EMAIL)
  return (
    <LegalPage title="Terms of Service" updated="1 November 2026">
      <p>
        These terms cover the use of Cedar Delivery Desk, the system a delivery company uses to run its deliveries. By using it, whether as staff, a courier,
        a shop or someone tracking a parcel, you agree to them. In these terms &ldquo;we&rdquo; means the delivery company that runs its deliveries with Cedar.
      </p>

      <h2 style={legalHeading}>Accounts</h2>
      <p>
        Keep your sign-in details private and tell us at once if you think someone else has used them. You are responsible for what is done with your account.
        Give accurate information, including the delivery address and phone number for each parcel.
      </p>

      <h2 style={legalHeading}>Orders and deliveries</h2>
      <p>
        A shop is responsible for what it sends and for having the right to send it. We may refuse or return a parcel that is unsafe, illegal or not as described.
        Delivery times are estimates. Cash collected on delivery is accounted to the shop under the delivery company&rsquo;s agreement with it.
      </p>

      <h2 style={legalHeading}>Messages</h2>
      <p>
        We message the people who receive parcels by WhatsApp about their delivery. Shops confirm that they have the recipient&rsquo;s agreement to be contacted
        about the delivery. Anyone can stop the messages by replying STOP.
      </p>

      <h2 style={legalHeading}>Acceptable use</h2>
      <p>
        Do not misuse the system: no attempts to get into accounts or data that are not yours, no overloading it, no using it to send anything unlawful, and no
        automated access except through the shop interface (API) we provide.
      </p>

      <h2 style={legalHeading}>Availability</h2>
      <p>
        We work to keep the service running, but it may be unavailable for maintenance or for reasons outside our control. We are not liable for losses that
        arise from that, as far as the law allows.
      </p>

      <h2 style={legalHeading}>Privacy</h2>
      <p>Our <a href="/privacy">Privacy Policy</a> explains what personal information we keep and why.</p>

      <h2 style={legalHeading}>Changes and contact</h2>
      <p>We may update these terms and will change the date above when we do. {contact}</p>
    </LegalPage>
  )
}
