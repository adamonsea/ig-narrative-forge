import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface ConfirmationEmailProps {
  topicName: string;
  topicSlug: string;
  topicLogoUrl?: string;
  verificationUrl: string;
  notificationType: 'daily' | 'weekly';
  baseUrl: string;
}

export const ConfirmationEmail = ({
  topicName = 'Your Topic',
  topicSlug = 'topic',
  topicLogoUrl,
  verificationUrl = 'https://curatr.pro/verify-subscription',
  notificationType = 'daily',
  baseUrl = 'https://curatr.pro',
}: ConfirmationEmailProps) => (
  <Html style={html}>
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <style>
        {`
          html, body { background: #ffffff !important; }
          * { -webkit-text-size-adjust: 100%; }
        `}
      </style>
    </Head>
    <Preview>Confirm your {topicName} {notificationType} briefing subscription</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          {topicLogoUrl ? (
            <Img src={topicLogoUrl} alt={topicName} style={topicLogo} />
          ) : (
            <Heading style={h1}>{topicName}</Heading>
          )}
          <Text style={subtitle}>{notificationType === 'daily' ? 'Daily' : 'Weekly'} Briefing</Text>
        </Section>

        <Hr style={hr} />

        <Section style={contentSection}>
          <Heading style={h2}>Confirm your subscription</Heading>
          <Text style={paragraph}>
            Thanks for subscribing to the {topicName} {notificationType} briefing! 
            Click the button below to confirm your email address.
          </Text>
          
          <Section style={ctaSection}>
            <Link href={verificationUrl} style={ctaButton}>
              Confirm Subscription ✓
            </Link>
          </Section>
          
          <Text style={paragraphSmall}>
            Once confirmed, you'll also unlock subscriber perks in Play Mode including:
          </Text>
          <Text style={perksList}>
            🏆 Score tracking & leaderboards<br/>
            ⭐ Exclusive content cards
          </Text>
        </Section>

        <Hr style={hr} />

        <Section style={footer}>
          <Text style={footerText}>
            If you didn't request this subscription, you can safely ignore this email.
          </Text>
          <Text style={footerTextSmall}>
            Button not working? Copy this link:<br/>
            <Link href={verificationUrl} style={footerLink}>{verificationUrl}</Link>
          </Text>
          <Text style={poweredBy}>
            <Link href="https://curatr.pro" style={poweredByLink}>curatr.pro</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ConfirmationEmail

const html = {
  backgroundColor: '#ffffff',
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 32px',
  marginBottom: '64px',
  maxWidth: '600px',
}

const header = {
  backgroundColor: '#ffffff',
  padding: '32px 32px 16px',
  textAlign: 'center' as const,
}

const topicLogo = {
  display: 'block',
  margin: '0 auto 12px',
  maxWidth: '320px',
  maxHeight: '96px',
  width: 'auto',
  height: 'auto',
}

const h1 = {
  color: '#111827',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 8px',
  padding: '0',
}

const h2 = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0 0 16px',
  padding: '0',
  textAlign: 'center' as const,
}

const subtitle = {
  color: '#6b7280',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '16px 32px',
}

const contentSection = {
  padding: '24px 32px',
}

const paragraph = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
}

const paragraphSmall = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '24px 0 8px',
  textAlign: 'center' as const,
}

const perksList = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  margin: '0',
}

const ctaSection = {
  textAlign: 'center' as const,
}

const ctaButton = {
  backgroundColor: '#10b981',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '700',
  padding: '14px 32px',
  textDecoration: 'none',
}

const footer = {
  backgroundColor: '#ffffff',
  padding: '0 32px 16px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 12px',
}

const footerTextSmall = {
  color: '#9ca3af',
  fontSize: '11px',
  lineHeight: '16px',
  margin: '0 0 16px',
  wordBreak: 'break-all' as const,
}

const footerLink = {
  color: '#6366f1',
  fontSize: '11px',
  textDecoration: 'underline',
}

const poweredBy = {
  color: '#9ca3af',
  fontSize: '11px',
  marginTop: '16px',
}

const poweredByLink = {
  color: '#6b7280',
  textDecoration: 'none',
  fontWeight: '700',
}
