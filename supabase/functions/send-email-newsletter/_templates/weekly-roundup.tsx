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
  Column,
  Row,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface StoryPreview {
  id: string;
  title: string;
  author?: string;
  publication_name?: string;
}

interface WeeklyRoundupEmailProps {
  topicName: string;
  topicSlug: string;
  weekStart: string;
  weekEnd: string;
  storyCount: number;
  stories: StoryPreview[];
  topSources?: string[];
  baseUrl: string;
}

export const WeeklyRoundupEmail = ({
  topicName = 'Your Topic',
  topicSlug = 'topic',
  weekStart = 'Dec 15',
  weekEnd = 'Dec 21',
  storyCount = 0,
  stories = [],
  topSources = [],
  baseUrl = 'https://eezeenews.com'
}: WeeklyRoundupEmailProps) => (
  <Html>
    <Head />
    <Preview>Your weekly {topicName} roundup - {storyCount} stories this week</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={header}>
          <Heading style={h1}>{topicName}</Heading>
          <Text style={subtitle}>Weekly Roundup • {weekStart} – {weekEnd}</Text>
        </Section>

        <Hr style={hr} />

        {/* Stats Summary */}
        <Section style={statsSection}>
          <Row>
            <Column style={statColumn}>
              <Text style={statNumber}>{storyCount}</Text>
              <Text style={statLabel}>Stories</Text>
            </Column>
            <Column style={statColumn}>
              <Text style={statNumber}>{topSources.length}</Text>
              <Text style={statLabel}>Sources</Text>
            </Column>
          </Row>
        </Section>

        <Hr style={hr} />

        {/* Top Stories */}
        {stories.length > 0 && (
          <>
            <Section style={sectionHeader}>
              <Text style={sectionTitle}>📰 Top Stories This Week</Text>
            </Section>
            <Section style={storiesSection}>
              {stories.slice(0, 7).map((story, index) => (
                <Section key={story.id} style={storyCard}>
                  <Link
                    href={`${baseUrl}/feed/${topicSlug}/story/${story.id}`}
                    style={storyLink}
                  >
                    <Text style={storyNumber}>#{index + 1}</Text>
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
          </>
        )}

        {/* Sources */}
        {topSources.length > 0 && (
          <>
            <Hr style={hr} />
            <Section style={sectionHeader}>
              <Text style={sectionTitle}>📍 This Week's Sources</Text>
            </Section>
            <Section style={sourcesSection}>
              <Text style={sourcesList}>
                {topSources.join(' • ')}
              </Text>
            </Section>
          </>
        )}

        <Hr style={hr} />

        {/* CTA */}
        <Section style={ctaSection}>
          <Link
            href={`${baseUrl}/feed/${topicSlug}`}
            style={ctaButton}
          >
            Explore All Stories →
          </Link>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            You're receiving this because you subscribed to {topicName} weekly updates.
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

export default WeeklyRoundupEmail

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

const statsSection = {
  padding: '16px 40px',
}

const statColumn = {
  textAlign: 'center' as const,
  width: '50%',
}

const statNumber = {
  color: '#6366f1',
  fontSize: '32px',
  fontWeight: '700',
  margin: '0',
}

const statLabel = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '4px 0 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const sectionHeader = {
  padding: '0 40px',
}

const sectionTitle = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '16px 0 8px',
}

const storiesSection = {
  padding: '8px 40px 16px',
}

const storyCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '14px 16px',
  marginBottom: '10px',
}

const storyLink = {
  textDecoration: 'none',
}

const storyNumber = {
  color: '#6366f1',
  fontSize: '11px',
  fontWeight: '700',
  margin: '0 0 4px',
}

const storyTitle = {
  color: '#1a1a1a',
  fontSize: '15px',
  fontWeight: '600',
  lineHeight: '22px',
  margin: '0',
}

const storyMeta = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '6px 0 0',
}

const sourcesSection = {
  padding: '0 40px 16px',
}

const sourcesList = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '22px',
  margin: '0',
  textAlign: 'center' as const,
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
