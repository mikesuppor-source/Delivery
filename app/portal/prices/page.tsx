import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Merchant Portal — Cedar Delivery',
}

export default function MerchantPricesPage() {
  redirect('/portal')
}
