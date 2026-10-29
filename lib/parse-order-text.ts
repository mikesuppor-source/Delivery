import { cleanPhone, formatLebanesePhone, isValidLebanesePhone } from './phone'
import { LEBANON_GEO } from './lebanon-geo'

export interface ParsedOrderDetails {
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  collectionUsd: number | null
  notes: string
  town?: string
  caza?: string
  governorate?: string
}

// Regex matching Lebanese phone numbers (03, 70, 71, 76, 78, 79, 81, landlines 01..09, and +961 formats)
const LEBANESE_PHONE_REGEX = /(?:\+?961[\s.-]?|00961[\s.-]?)?(?:(?:0?3[\s.-]?\d{3}[\s.-]?\d{3})|(?:0?(?:7[01689]|81)[\s.-]?\d{3}[\s.-]?\d{3})|(?:0?[14-9][\s.-]?\d{3}[\s.-]?\d{3})|(?:\d{2}[\s.-]?\d{3}[\s.-]?\d{3}))/

export function extractPhone(text: string): string | null {
  const labelMatch = text.match(/^(?:phone|mobile|tel|cell|رقم|هاتف|تلفون|موبايل)[\s:=]+(.*)/i)
  if (labelMatch) {
    const rawVal = labelMatch[1].trim()
    const cleaned = cleanPhone(rawVal)
    if (isValidLebanesePhone(cleaned)) {
      return formatLebanesePhone(cleaned)
    }
  }

  const match = text.match(LEBANESE_PHONE_REGEX)
  if (match) {
    const cleaned = cleanPhone(match[0])
    if (isValidLebanesePhone(cleaned)) {
      return formatLebanesePhone(cleaned)
    }
  }

  return null
}

/**
 * Intelligent parser for copying and pasting raw order messages from WhatsApp or SMS
 * in both Arabic and English into structured order attributes.
 */
export function parseOrderText(raw: string, rate: number = 89500): ParsedOrderDetails {
  if (!raw || !raw.trim()) {
    return {
      recipientName: '',
      recipientPhone: '',
      recipientAddress: '',
      collectionUsd: null,
      notes: '',
    }
  }

  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  let name = ''
  let phone = ''
  let address = ''
  let collectionUsd: number | null = null
  const notesLines: string[] = []

  const usdPattern = /(?:\$|usd)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:\$|usd)/i
  const lbpPattern = /(\d{1,3}(?:[,\s]\d{3})*|\d+)\s*(?:lbp|l\.l|ل\.ل|ألف|ليرة)/i

  // Case 1: Single-line comma-separated text: "Maya Salem, 76 111 222, Achrafieh Sassine, $65, Urgent evening delivery"
  if (lines.length === 1 && (lines[0].includes(',') || lines[0].includes('،'))) {
    const parts = lines[0].split(/[,،]/).map(p => p.trim()).filter(Boolean)
    for (const part of parts) {
      const extractedP = extractPhone(part)
      if (extractedP && !phone) {
        phone = extractedP
        continue
      }

      const lbpMatch = part.match(lbpPattern)
      if (lbpMatch && collectionUsd === null) {
        const rawLbp = Number(lbpMatch[1].replace(/[,\\s]/g, ''))
        if (!isNaN(rawLbp) && rawLbp > 0) {
          collectionUsd = Math.round((rawLbp / rate) * 100) / 100
          continue
        }
      }

      const usdMatch = part.match(usdPattern) || part.match(/(\d+(?:\.\d{1,2})?)/)
      if (usdMatch && collectionUsd === null && (part.includes('$') || /usd/i.test(part))) {
        const val = usdMatch[1] || usdMatch[2]
        if (val) {
          collectionUsd = parseFloat(val)
          continue
        }
      }

      if (!name) {
        name = part
      } else if (!address) {
        address = part
      } else {
        notesLines.push(part)
      }
    }
  } else {
    // Case 2: Multi-line message
    for (const line of lines) {
      // 1. Check for Phone Line or phone match
      const isExplicitPhone = /^(?:phone|mobile|tel|cell|رقم|هاتف|تلفون|موبايل)[\s:=]/i.test(line)
      if (isExplicitPhone) {
        const extracted = extractPhone(line)
        if (extracted && !phone) {
          phone = extracted
          continue
        }
      } else {
        const extracted = extractPhone(line)
        if (extracted && !phone) {
          phone = extracted
          const stripped = line.replace(LEBANESE_PHONE_REGEX, '').trim()
          if (!stripped) {
            continue
          }
        }
      }

      // 2. Check for Name Line
      const nameMatch = line.match(/^(?:name|customer|client|الاسم|اسم|زبون|عميل)[\s:=]+(.*)/i)
      if (nameMatch && !name) {
        name = nameMatch[1].trim()
        continue
      }

      // 3. Check for Address Line
      const addressMatch = line.match(/^(?:address|location|destination|addr|العنوان|عنوان|موقع|منطقة)[\s:=]+(.*)/i)
      if (addressMatch) {
        address = addressMatch[1].trim()
        continue
      }

      // 4. Check for COD / Price Line
      const codMatch = line.match(/^(?:cod|amount|total|price|cash|collection|المبلغ|مبلغ|سعر|تحصيل|حساب)[\s:=]+(.*)/i)
      if (codMatch) {
        const valText = codMatch[1].trim()
        const lbpMatch = valText.match(lbpPattern)
        if (lbpMatch) {
          const rawLbp = Number(lbpMatch[1].replace(/[,\\s]/g, ''))
          if (!isNaN(rawLbp) && rawLbp > 0) {
            collectionUsd = Math.round((rawLbp / rate) * 100) / 100
            continue
          }
        }
        const usdMatch = valText.match(usdPattern) || valText.match(/(\d+(?:\.\d{1,2})?)/)
        if (usdMatch) {
          const val = usdMatch[1] || usdMatch[2]
          if (val) {
            collectionUsd = parseFloat(val)
            continue
          }
        }
      }

      // 5. Inline COD Detection if collectionUsd is still empty
      if (collectionUsd === null) {
        if (lbpPattern.test(line)) {
          const lbp = line.match(lbpPattern)
          if (lbp) {
            const rawLbp = Number(lbp[1].replace(/[,\\s]/g, ''))
            if (!isNaN(rawLbp) && rawLbp > 0) {
              collectionUsd = Math.round((rawLbp / rate) * 100) / 100
              continue
            }
          }
        } else if (usdPattern.test(line)) {
          const usdMatch = line.match(usdPattern)
          if (usdMatch) {
            const val = usdMatch[1] || usdMatch[2]
            if (val) {
              collectionUsd = parseFloat(val)
              continue
            }
          }
        }
      }

      // 6. Check for Notes Line
      const notesMatch = line.match(/^(?:notes|note|items|item|desc|remarks|ملاحظات|ملاحظة|تفاصيل|أغراض)[\s:=]+(.*)/i)
      if (notesMatch) {
        notesLines.push(notesMatch[1].trim())
        continue
      }

      // 7. Fallback Heuristics
      if (/(?:street|st\.|bldg|building|floor|near|behind|شارع|بناية|طابق|قرب|جانب|مبنى|حي|ساحة)/i.test(line)) {
        if (!address) {
          address = line
        } else {
          address += ', ' + line
        }
        continue
      }

      if (!name && line.length < 50 && !/\d{4}/.test(line)) {
        name = line
        continue
      }

      notesLines.push(line)
    }
  }

  // Geographic town detection from address or raw text
  let detectedTown: string | undefined
  let detectedCaza: string | undefined
  let detectedGov: string | undefined

  let bestMatch: { townEn: string; cazaEn: string; govEn: string; score: number } | null = null

  for (const gov of LEBANON_GEO) {
    for (const caza of gov.cazas) {
      for (const town of caza.towns) {
        const en = town.nameEn.toLowerCase()
        const ar = town.nameAr
        let matched = false

        if (en.length >= 3) {
          const regexEn = new RegExp(`\\b${en.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
          if (regexEn.test(address) || regexEn.test(raw)) {
            matched = true
          }
        }
        if (ar.length >= 3 && (address.includes(ar) || raw.includes(ar))) {
          matched = true
        }

        if (matched) {
          const inAddress = address.toLowerCase().includes(en) || address.includes(ar)
          const score = (inAddress ? 1000 : 0) + en.length
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              townEn: town.nameEn,
              cazaEn: caza.nameEn,
              govEn: gov.nameEn,
              score,
            }
          }
        }
      }
    }
  }

  if (bestMatch) {
    detectedTown = bestMatch.townEn
    detectedCaza = bestMatch.cazaEn
    detectedGov = bestMatch.govEn
  }

  return {
    recipientName: name.trim(),
    recipientPhone: phone ? (formatLebanesePhone(phone) || phone.trim()) : '',
    recipientAddress: address.trim(),
    collectionUsd: collectionUsd !== null && !isNaN(collectionUsd) ? collectionUsd : null,
    notes: notesLines.join(' | ').trim(),
    town: detectedTown,
    caza: detectedCaza,
    governorate: detectedGov,
  }
}
