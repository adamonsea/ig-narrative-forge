import { Img, Link, Section, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import type { EmailBrand, RichEmailEvent } from '../emailEvents.ts'

/**
 * Picture-led event cards for events-focused emails: picture band (listing photo, or the
 * category illustration on the feed's tint), then category, when, title, where/price,
 * a short description and one button in the feed's colour.
 */
export const EventCards = ({ events, heading, brand }: { events: RichEmailEvent[]; heading: string; brand: EmailBrand }) => (
  <Section style={wrap}>
    <Text style={headingStyle}>{heading}</Text>
    {events.map((e) => {
      const facts = [e.location, e.price_label].filter(Boolean).join(' · ');
      const picture = e.photo_url ? (
        <Img src={e.photo_url} alt="" width={552} style={image} />
      ) : (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td bgcolor={brand.tint} style={{ backgroundColor: brand.tint, borderRadius: '12px 12px 0 0', lineHeight: 0 }}>
                <Img src={e.art_url} alt="" width={552} style={image} />
              </td>
            </tr>
          </tbody>
        </table>
      );
      return (
        <Section key={e.id} style={card}>
          {e.url ? <Link href={e.url} target="_blank">{picture}</Link> : picture}
          <Section style={body}>
            {e.category_label && <Text style={{ ...label, color: brand.accent }}>{e.category_label}</Text>}
            <Text style={when}>{e.date_label} · {e.time_label}</Text>
            {e.url ? (
              <Link href={e.url} target="_blank" style={title}>{e.title}</Link>
            ) : (
              <Text style={title}>{e.title}</Text>
            )}
            {facts && <Text style={factsStyle}>{facts}</Text>}
            {e.description && <Text style={description}>{e.description}</Text>}
            {e.url && (
              <Link href={e.url} target="_blank" style={{ ...button, backgroundColor: brand.fill, color: brand.onFill }}>
                {e.source_name ? `More at ${e.source_name}` : 'More info'} →
              </Link>
            )}
          </Section>
        </Section>
      );
    })}
  </Section>
)

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const wrap = { padding: '8px 24px 8px' }
const headingStyle = { color: '#111827', fontSize: '22px', fontWeight: '700', lineHeight: '28px', margin: '0 0 16px', fontFamily: font }
const card = { border: '1px solid #e5e7eb', borderRadius: '12px', margin: '0 0 20px', backgroundColor: '#ffffff' }
const image = { display: 'block', width: '100%', maxWidth: '552px', height: 'auto', border: '0', borderRadius: '12px 12px 0 0' }
const body = { padding: '16px 20px 20px' }
const label = { fontSize: '13px', fontWeight: '700', lineHeight: '18px', margin: '0 0 4px', fontFamily: font }
const when = { color: '#111827', fontSize: '15px', fontWeight: '600', lineHeight: '20px', margin: '0 0 6px', fontFamily: font }
const title = { color: '#111827', fontSize: '21px', fontWeight: '700', lineHeight: '27px', margin: '0 0 6px', textDecoration: 'none', display: 'block', fontFamily: font }
const factsStyle = { color: '#4b5563', fontSize: '15px', lineHeight: '21px', margin: '0 0 8px', fontFamily: font }
const description = { color: '#374151', fontSize: '15px', lineHeight: '22px', margin: '0 0 16px', fontFamily: font }
const button = { display: 'inline-block', padding: '12px 20px', borderRadius: '999px', fontSize: '15px', fontWeight: '600', textDecoration: 'none', fontFamily: font }
