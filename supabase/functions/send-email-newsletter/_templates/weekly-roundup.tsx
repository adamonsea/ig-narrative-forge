import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface EmailStory {
  id: string;
  title: string;
  thumbnail_url: string | null;
  source_name: string;
  story_url: string;
}

interface WeeklyRoundupEmailProps {
  topicName: string;
  topicSlug: string;
  topicLogoUrl?: string;
  weekStart: string;
  weekEnd: string;
  weekStartParam: string; // YYYY-MM-DD format for URL
  stories: EmailStory[];
  baseUrl: string;
  unsubscribeUrl?: string;
}

export const WeeklyRoundupEmail = ({
  topicName = 'Your Topic',
  topicSlug = 'topic',
  topicLogoUrl,
  weekStart = 'Dec 15',
  weekEnd = 'Dec 21',
  weekStartParam = new Date().toISOString().split('T')[0],
  stories = [],
  baseUrl = 'https://curatr.pro',
  unsubscribeUrl,
}: WeeklyRoundupEmailProps) => (
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
    <Preview>{topicName} Weekly Briefing • {stories.length} stories</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          {topicLogoUrl ? (
            <Img src={topicLogoUrl} alt={topicName} style={topicLogo} />
          ) : (
            <Heading style={h1}>{topicName}</Heading>
          )}
          <Text style={subtitle}>Weekly Briefing • {weekStart} – {weekEnd}</Text>
        </Section>

        <Hr style={hr} />

        {stories.length > 0 ? (
          <Section style={storiesSection}>
            {stories.map((story) => (
              <Link key={story.id} href={story.story_url} target="_blank" style={storyLink}>
                <Section style={storyCard}>
                  <Row>
                    <Column style={thumbnailColumn}>
                      {story.thumbnail_url ? (
                        <Img
                          src={story.thumbnail_url}
                          alt={`${story.title} thumbnail`}
                          width={80}
                          height={80}
                          style={thumbnail}
                        />
                      ) : (
                        <div style={placeholderThumb} />
                      )}
                    </Column>
                    <Column style={contentColumn}>
                      <Text style={storyTitle}>{story.title}</Text>
                      <Text style={sourceName}>{story.source_name}</Text>
                    </Column>
                  </Row>
                </Section>
              </Link>
            ))}
          </Section>
        ) : (
          <Section style={emptySection}>
            <Text style={emptyText}>No stories for this week.</Text>
          </Section>
        )}

        <Hr style={hr} />

        <Section style={ctaSection}>
          <Link href={`${baseUrl}/feed/${topicSlug}/weekly/${weekStartParam}`} target="_blank" style={ctaButtonPrimary}>
            View Weekly Briefing →
          </Link>
          <Link href={`${baseUrl}/feed/${topicSlug}`} target="_blank" style={ctaButtonSecondary}>
            Visit Feed
          </Link>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>You're receiving this because you subscribed to weekly briefing updates.</Text>
          <Link href={unsubscribeUrl || `${baseUrl}/feed/${topicSlug}?unsubscribe=weekly`} target="_blank" style={footerLink}>
            Unsubscribe
          </Link>
          <Text style={poweredBy}>
            <Link href={baseUrl} target="_blank" style={poweredByLink}>curatr.pro</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WeeklyRoundupEmail

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

const storiesSection = {
  padding: '8px 32px',
}

const storyLink = {
  textDecoration: 'none',
}

const storyCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '12px',
  marginBottom: '12px',
}

const thumbnailColumn = {
  width: '80px',
  verticalAlign: 'top' as const,
}

const thumbnail = {
  borderRadius: '8px',
  objectFit: 'cover' as const,
  width: '80px',
  height: '80px',
}

const placeholderThumb = {
  backgroundColor: '#e5e7eb',
  borderRadius: '8px',
  width: '80px',
  height: '80px',
}

const contentColumn = {
  paddingLeft: '12px',
  verticalAlign: 'top' as const,
}

const storyTitle = {
  color: '#111827',
  fontSize: '15px',
  fontWeight: '600',
  lineHeight: '20px',
  margin: '0 0 6px',
}

const sourceName = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0',
}

const emptySection = {
  padding: '32px',
  textAlign: 'center' as const,
}

const emptyText = {
  color: '#6b7280',
  fontSize: '14px',
}

const ctaSection = {
  padding: '16px 32px 24px',
  textAlign: 'center' as const,
}

const ctaButtonPrimary = {
  backgroundColor: '#6366f1',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '700',
  padding: '12px 24px',
  textDecoration: 'none',
  marginRight: '12px',
}

const ctaButtonSecondary = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  color: '#111827',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '700',
  padding: '12px 24px',
  textDecoration: 'none',
}

const footer = {
  backgroundColor: '#ffffff',
  padding: '0 32px 16px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#9ca3af',
  fontSize: '11px',
  lineHeight: '18px',
  margin: '0 0 8px',
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
