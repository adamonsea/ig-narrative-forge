import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Button asChild variant="ghost" className="mb-8">
          <Link to="/" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>

        <h1 className="text-4xl font-display font-bold mb-8">Cookie Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: 27 December 2024</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies are small text files stored on your device when you visit a website. 
              They help websites function properly, remember your preferences, and provide 
              information to site owners about how the site is used.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Curatr.pro uses cookies to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Keep you signed in to your account</li>
              <li>Remember your preferences and settings</li>
              <li>Understand how you use our service</li>
              <li>Improve our website and services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Types of Cookies We Use</h2>
            
            <h3 className="text-xl font-medium mt-6 mb-3">3.1 Strictly Necessary Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              These cookies are essential for the website to function. They enable core features 
              like authentication and security. You cannot opt out of these cookies.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-2">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>sb-*-auth-token:</strong> Authentication session (Supabase)</li>
                <li><strong>cookie_consent:</strong> Stores your cookie preferences</li>
              </ul>
            </div>

            <h3 className="text-xl font-medium mt-6 mb-3">3.2 Analytics Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              These cookies help us understand how visitors use our website by collecting 
              anonymised information. This helps us improve our service.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-2">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>visitor_id:</strong> Anonymous visitor identifier</li>
                <li><strong>feed_visit_*:</strong> Tracks feed visits for analytics</li>
              </ul>
            </div>

            <h3 className="text-xl font-medium mt-6 mb-3">3.3 Functional Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              These cookies remember your choices and preferences to provide a more 
              personalised experience.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-2">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>subscriber_email:</strong> Remembers your subscription email</li>
                <li><strong>onboarding_*:</strong> Tracks onboarding progress</li>
                <li><strong>theme:</strong> Your preferred color theme</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Third-Party Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the following third-party services that may set cookies:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Supabase:</strong> For authentication and data storage (essential)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do not use third-party advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you first visit our site, you'll see a cookie consent banner. You can:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Accept all cookies with one click</li>
              <li>Reject non-essential cookies</li>
              <li>Manage your preferences in your browser settings</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Most browsers allow you to control cookies through their settings. However, 
              blocking essential cookies may affect the functionality of our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Cookie Retention</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Session cookies:</strong> Deleted when you close your browser</li>
              <li><strong>Authentication cookies:</strong> Up to 30 days (or until logout)</li>
              <li><strong>Preference cookies:</strong> Up to 1 year</li>
              <li><strong>Consent cookie:</strong> 1 year</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. UK PECR Compliance</h2>
            <p className="text-muted-foreground leading-relaxed">
              In accordance with the Privacy and Electronic Communications Regulations (PECR), 
              we obtain your consent before placing non-essential cookies on your device. 
              Essential cookies that are strictly necessary for the service do not require consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Updates to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Cookie Policy from time to time. Any changes will be 
              posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about our use of cookies, please contact us at legal@curatr.pro
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex gap-4">
            <Link to="/terms" className="text-primary hover:underline">Terms and Conditions</Link>
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cookies;
