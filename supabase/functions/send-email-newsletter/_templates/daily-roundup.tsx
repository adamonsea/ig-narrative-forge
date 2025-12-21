import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface StoryPreview {
  id: string;
  title: string;
  author?: string;
  publication_name?: string;
}

interface DailyRoundupEmailProps {
  topicName: string;
  topicSlug: string;
  date: string;
  storyCount: number;
  stories: StoryPreview[];
  baseUrl: string;
}

export const DailyRoundupEmail = ({
  topicName = 'Your Topic',
  topicSlug = 'topic',
  date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
  storyCount = 0,
  stories = [],
  baseUrl = 'https://eezeenews.com'
}: DailyRoundupEmailProps) => (
  <Html>
    <Head />
    <Preview>Your daily {topicName} briefing - {storyCount} {storyCount === 1 ? 'story' : 'stories'} today</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={header}>
          <Heading style={h1}>{topicName}</Heading>
          <Text style={subtitle}>Daily Briefing • {date}</Text>
        </Section>

        <Hr style={hr} />

        {/* Summary */}
        <Section style={summarySection}>
          <Text style={summaryText}>
            {storyCount === 0 
              ? "No new stories today. Check back tomorrow!"
              : `${storyCount} ${storyCount === 1 ? 'story' : 'stories'} published today`
            }
          </Text>
        </Section>

        {/* Stories */}
        {stories.length > 0 && (
          <Section style={storiesSection}>
            {stories.map((story, index) => (
              <Section key={story.id} style={storyCard}>
                <Link
                  href={`${baseUrl}/feed/${topicSlug}/story/${story.id}`}
                  style={storyLink}
                >
                  <Text style={storyNumber}>{index + 1}</Text>
                  <Text style={storyTitle}>{story.title}</Text>
                </Link>
                {(story.author || story.publication_name) && (
                  <Text style={storyMeta}>
                    {story.author && `By ${story.author}`}
                    {story.author && story.publication_name && ' • '}
                    {story.publication_name}
                  </Text>
                )}
              </Section>
            ))}
          </Section>
        )}

        <Hr style={hr} />

        {/* CTA */}
        <Section style={ctaSection}>
          <Link
            href={`${baseUrl}/feed/${topicSlug}`}
            style={ctaButton}
          >
            Read All Stories →
          </Link>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            You're receiving this because you subscribed to {topicName} daily updates.
          </Text>
          <Link
            href={`${baseUrl}/feed/${topicSlug}`}
            style={footerLink}
          >
            Manage preferences
          </Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default DailyRoundupEmail

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
}

const header = {
  padding: '32px 40px 16px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 8px',
  padding: '0',
}

const subtitle = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '20px 40px',
}

const summarySection = {
  padding: '0 40px',
}

const summaryText = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 0',
  textAlign: 'center' as const,
}

const storiesSection = {
  padding: '16px 40px',
}

const storyCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
}

const storyLink = {
  textDecoration: 'none',
}

const storyNumber = {
  color: '#6366f1',
  fontSize: '12px',
  fontWeight: '600',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const storyTitle = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  lineHeight: '24px',
  margin: '0',
}

const storyMeta = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '8px 0 0',
}

const ctaSection = {
  padding: '24px 40px',
  textAlign: 'center' as const,
}

const ctaButton = {
  backgroundColor: '#6366f1',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 24px',
  textDecoration: 'none',
}

const footer = {
  padding: '0 40px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0 0 8px',
}

const footerLink = {
  color: '#6366f1',
  fontSize: '12px',
  textDecoration: 'underline',
}
