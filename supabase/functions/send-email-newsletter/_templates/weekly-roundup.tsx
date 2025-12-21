import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Row,
  Column,
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
  weekStart: string;
  weekEnd: string;
  stories: EmailStory[];
  baseUrl: string;
  unsubscribeUrl?: string;
}

export const WeeklyRoundupEmail = ({
  topicName = 'Your Topic',
  topicSlug = 'topic',
  weekStart = 'Dec 15',
  weekEnd = 'Dec 21',
  stories = [],
  baseUrl = 'https://curatr.pro',
  unsubscribeUrl
}: WeeklyRoundupEmailProps) => (
  <Html>
    <Head />
    <Preview>Your weekly {topicName} roundup - {stories.length} top stories</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={header}>
          <Text style={logo}>curatr.pro</Text>
          <Heading style={h1}>{topicName}</Heading>
          <Text style={subtitle}>Weekly Roundup • {weekStart} – {weekEnd}</Text>
        </Section>

        <Hr style={hr} />

        {/* Stories */}
        {stories.length > 0 ? (
          <Section style={storiesSection}>
            {stories.map((story) => (
              <Link key={story.id} href={story.story_url} style={storyLink}>
                <Section style={storyCard}>
                  <Row>
                    <Column style={thumbnailColumn}>
                      {story.thumbnail_url ? (
                        <Img
                          src={story.thumbnail_url}
                          alt=""
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
            <Text style={emptyText}>No stories this week. Check back next Sunday!</Text>
          </Section>
        )}

        <Hr style={hr} />

        {/* CTAs */}
        <Section style={ctaSection}>
          <Link href={`${baseUrl}/feed/${topicSlug}/roundup/weekly`} style={ctaButtonPrimary}>
            See All Stories →
          </Link>
          <Link href={`${baseUrl}/feed/${topicSlug}`} style={ctaButtonSecondary}>
            Visit Feed
          </Link>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            You're receiving this because you subscribed to {topicName} weekly updates.
          </Text>
          <Link
            href={unsubscribeUrl || `${baseUrl}/feed/${topicSlug}?unsubscribe=weekly`}
            style={footerLink}
          >
            Unsubscribe
          </Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WeeklyRoundupEmail

// Styles
const main = {
  backgroundColor: '#f6f9fc',
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
  padding: '24px 32px 16px',
  textAlign: 'center' as const,
}

const logo = {
  color: '#6366f1',
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
}

const h1 = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 4px',
  padding: '0',
}

const subtitle = {
  color: '#6b7280',
  fontSize: '13px',
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
  color: '#1a1a1a',
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
  fontWeight: '600',
  padding: '12px 24px',
  textDecoration: 'none',
  marginRight: '12px',
}

const ctaButtonSecondary = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  color: '#374151',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 24px',
  textDecoration: 'none',
}

const footer = {
  padding: '0 32px',
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
