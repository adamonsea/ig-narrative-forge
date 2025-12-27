import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Button asChild variant="ghost" className="mb-8">
          <Link to="/" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>

        <h1 className="text-4xl font-display font-bold mb-8">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: 27 December 2024</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Curatr.pro ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We comply with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, 
              and the Privacy and Electronic Communications Regulations (PECR).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Data Controller</h2>
            <p className="text-muted-foreground leading-relaxed">
              Curatr.pro is the data controller responsible for your personal data. 
              Contact: legal@curatr.pro
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Information We Collect</h2>
            
            <h3 className="text-xl font-medium mt-6 mb-3">3.1 Information You Provide</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Account Information:</strong> Email address, name, and authentication credentials</li>
              <li><strong>Newsletter Subscriptions:</strong> Email address, first name, and notification preferences</li>
              <li><strong>Content Preferences:</strong> Topics and feeds you subscribe to</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">3.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Usage Data:</strong> Pages visited, time spent, features used</li>
              <li><strong>Device Information:</strong> Browser type, operating system, device type</li>
              <li><strong>Analytics Data:</strong> Anonymised interaction data for service improvement</li>
              <li><strong>Cookies:</strong> Essential and analytics cookies (see Cookie Policy)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Legal Basis for Processing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We process your personal data on the following legal bases:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Consent:</strong> For newsletter subscriptions and marketing communications</li>
              <li><strong>Contract:</strong> To provide our services to registered users</li>
              <li><strong>Legitimate Interests:</strong> For analytics, security, and service improvement</li>
              <li><strong>Legal Obligation:</strong> Where required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>To provide and maintain our service</li>
              <li>To send newsletters and updates you've subscribed to</li>
              <li>To personalise your experience</li>
              <li>To analyse usage patterns and improve our service</li>
              <li>To communicate important service updates</li>
              <li>To prevent fraud and ensure security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal data. We may share data with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Service Providers:</strong> Hosting, email delivery, analytics (with data processing agreements)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect rights</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Our primary service provider is Supabase (data processed in the EU/UK). Email delivery 
              uses GDPR-compliant providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Account Data:</strong> Retained while your account is active, deleted upon request</li>
              <li><strong>Newsletter Subscriptions:</strong> Until you unsubscribe</li>
              <li><strong>Analytics Data:</strong> Aggregated and anonymised, retained for up to 2 years</li>
              <li><strong>Consent Records:</strong> Retained for 6 years for compliance purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights (UK GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under UK data protection law, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Rectification:</strong> Correct inaccurate personal data</li>
              <li><strong>Erasure:</strong> Request deletion of your personal data</li>
              <li><strong>Restriction:</strong> Request limited processing of your data</li>
              <li><strong>Portability:</strong> Receive your data in a portable format</li>
              <li><strong>Object:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent at any time (where applicable)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise these rights, contact us at legal@curatr.pro. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is primarily processed within the UK and EEA. Where data is transferred 
              outside these regions, we ensure appropriate safeguards are in place (Standard 
              Contractual Clauses or adequacy decisions).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organisational measures to protect your 
              personal data, including encryption, access controls, and regular security reviews.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our service is not intended for children under 16. We do not knowingly collect 
              personal data from children under 16. If you believe we have collected such data, 
              please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. We will notify you of significant 
              changes via email or through the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Complaints</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have concerns about how we handle your data, please contact us first. 
              You also have the right to lodge a complaint with the Information Commissioner's 
              Office (ICO): <a href="https://ico.org.uk" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For privacy-related enquiries: legal@curatr.pro
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex gap-4">
            <Link to="/terms" className="text-primary hover:underline">Terms and Conditions</Link>
            <Link to="/cookies" className="text-primary hover:underline">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
