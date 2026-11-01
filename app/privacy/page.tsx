import { LegalPage, contactLine, legalHeading } from '@/components/legal-page'

export const metadata = {
  title: 'Privacy Policy | Cedar Delivery Desk',
  description: 'What personal information Cedar Delivery Desk keeps, why, and the choices you have.',
}

export default function PrivacyPage() {
  const contact = contactLine(process.env.NEXT_PUBLIC_CONTACT_EMAIL)
  return (
    <LegalPage title="Privacy Policy" updated="1 November 2026">
      <p>
        Cedar Delivery Desk is the software that delivery companies and their shops use to take orders, deliver parcels and keep their accounts.
        This page explains what personal information it keeps and the choices you have. In this page, &ldquo;we&rdquo; means the delivery company that runs
        its deliveries with Cedar.
      </p>

      <h2 style={legalHeading}>What we keep</h2>
      <ul>
        <li>For people who receive a parcel: your name, phone number, delivery address and the location you shared, and the details of the order (cash to collect, notes, status and delivery history).</li>
        <li>For shops and couriers: name, phone number, email address, sign-in details and account records such as payouts and statements.</li>
        <li>Proof of delivery: photos or signatures a courier records when handing over a parcel.</li>
        <li>Messages: a record of the WhatsApp messages we send you about your parcel, whether they were delivered, and any reply you send us.</li>
      </ul>

      <h2 style={legalHeading}>Why we keep it</h2>
      <ul>
        <li>To deliver your parcel and tell you where it is.</li>
        <li>To collect and pay cash correctly between the shop, the courier and us.</li>
        <li>To handle problems such as a failed delivery, a return or a complaint.</li>
        <li>To keep our systems secure and to meet legal and accounting duties.</li>
      </ul>

      <h2 style={legalHeading}>WhatsApp messages</h2>
      <p>
        We send short messages about your parcel: that your order is confirmed, that it is out for delivery, that it was delivered, that a delivery attempt
        failed, or that it is kept safely in our warehouse. We do not send advertising. To stop these messages, reply <strong>STOP</strong> to any of them
        (in Arabic, <strong>إيقاف</strong>) and we will not message that number again. Reply <strong>START</strong> to receive them again. WhatsApp is run by
        Meta Platforms and handles the messages under its own terms and privacy policy.
      </p>

      <h2 style={legalHeading}>Who sees it</h2>
      <p>
        Your information is seen by the staff and couriers who need it to deliver your parcel, and by the shop that sent it. We use trusted providers to run the
        service: Supabase (database and file storage), Vercel (website hosting), Meta (WhatsApp) and an email provider. They handle the information only to provide
        their service to us. We do not sell personal information.
      </p>

      <h2 style={legalHeading}>How long we keep it</h2>
      <p>
        We keep order and account records for as long as we need them to run the service, to keep accurate accounts and to meet legal duties, and then delete
        or anonymise them. Message records are kept so we can show that a message was sent.
      </p>

      <h2 style={legalHeading}>Your choices</h2>
      <p>
        You can ask us to show you the information we hold about you, to correct it, or to delete it where the law lets us. You can stop WhatsApp messages at any
        time by replying STOP. {contact}
      </p>

      <h2 style={legalHeading}>Security</h2>
      <p>
        Information is sent over encrypted connections and kept in access-controlled systems. Staff see only what their role needs. No system is perfectly
        secure, so if we learn of a problem that affects you we will tell you.
      </p>

      <h2 style={legalHeading}>Changes</h2>
      <p>If we change this page we will update the date above.</p>
    </LegalPage>
  )
}
