import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Button asChild variant="ghost" className="mb-8">
          <Link to="/" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>

        <h1 className="text-4xl font-display font-bold mb-8">Terms and Conditions</h1>
        <p className="text-muted-foreground mb-8">Last updated: 27 December 2024</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Curatr.pro ("we", "our", "us"). These Terms and Conditions govern your use of our website 
              and services. By accessing or using Curatr.pro, you agree to be bound by these terms.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Curatr.pro is operated from the United Kingdom and is subject to UK law. Our registered address 
              is available upon request.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
            <p className="text-muted-foreground leading-relaxed">
              Curatr.pro is a content curation and distribution platform that allows users to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Aggregate content from various web sources</li>
              <li>Transform and rewrite content using AI technology</li>
              <li>Distribute curated content via web feeds, email newsletters, and social media</li>
              <li>Build and grow audiences for niche content topics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              To use certain features of our service, you must create an account. You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Ensuring your account information is accurate and up-to-date</li>
              <li>Notifying us immediately of any unauthorised use</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to use our service to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon intellectual property rights of others</li>
              <li>Distribute harmful, defamatory, or illegal content</li>
              <li>Attempt to gain unauthorised access to our systems</li>
              <li>Use automated systems to scrape or abuse our service</li>
              <li>Misrepresent sourced content or remove attributions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Content and Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Your Content:</strong> You retain ownership of content you create or upload. By using our service, 
              you grant us a licence to host, display, and distribute your content as necessary to provide the service.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong>Source Attribution:</strong> Our platform maintains attribution to original content sources. 
              You agree to respect copyright and fair use principles when curating content.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong>Our Content:</strong> All platform features, designs, and branding remain our intellectual property.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Email Subscriptions and Communications</h2>
            <p className="text-muted-foreground leading-relaxed">
              When subscribing to newsletters or email communications:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You consent to receive emails at the frequency you selected (daily/weekly)</li>
              <li>You can unsubscribe at any time via the link in each email</li>
              <li>Your email address will be handled in accordance with our Privacy Policy</li>
              <li>We will not share your email with third parties for marketing purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Curatr.pro shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages arising from your use of the service.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do not guarantee the accuracy, completeness, or reliability of any content distributed 
              through our platform. Content is provided "as is" without warranties of any kind.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violation of these terms. 
              You may also delete your account at any time. Upon termination, your right to use the service 
              ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms from time to time. We will notify users of significant changes via 
              email or through the platform. Continued use of the service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms are governed by and construed in accordance with the laws of England and Wales. 
              Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these terms, please contact us at legal@curatr.pro
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex gap-4">
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            <Link to="/cookies" className="text-primary hover:underline">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
