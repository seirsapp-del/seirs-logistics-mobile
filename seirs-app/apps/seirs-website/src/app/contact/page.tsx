"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Send, CheckCircle, Building2, Truck, Store, MessageSquare } from "lucide-react";

const subjects = [
  { value: "general", label: "General Enquiry" },
  { value: "business", label: "Business Account" },
  { value: "driver", label: "Driver Application" },
  { value: "partner", label: "Partner Store Application" },
  { value: "support", label: "Support / Issue" },
];

const contactCards = [
  {
    icon: Mail,
    label: "General Support",
    value: "support@seirs.co",
    href: "mailto:support@seirs.co",
    desc: "For delivery issues, account questions, and general help.",
    color: "bg-sky/10",
    iconColor: "text-sky",
  },
  {
    icon: Building2,
    label: "Business Enquiries",
    value: "business@seirs.co",
    href: "mailto:business@seirs.co",
    desc: "For business accounts, bulk pricing, API access, and partnerships.",
    color: "bg-navy/10",
    iconColor: "text-navy",
  },
  {
    icon: Mail,
    label: "Legal & Privacy",
    value: "legal@seirs.co",
    href: "mailto:legal@seirs.co",
    desc: "For terms, data requests, and compliance matters.",
    color: "bg-success-green/10",
    iconColor: "text-success-green",
  },
  {
    icon: Phone,
    label: "Phone Support",
    value: "+234 800 000 0000",
    href: "tel:+2348000000000",
    desc: "Mon–Fri, 8am–6pm WAT. For urgent delivery issues.",
    color: "bg-warning-amber/10",
    iconColor: "text-warning-amber",
  },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "general",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("Contact form submission:", form);
    // Simulate a short delay for UX
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 900);
  }

  return (
    <div className="bg-off-white min-h-screen">
      {/* Header */}
      <div className="bg-navy py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sky/20 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} className="text-sky" />
            </div>
            <div className="text-sky text-sm font-semibold tracking-wider uppercase">
              Get in Touch
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-3">Contact Us</h1>
          <p className="text-white/60 text-lg max-w-xl">
            Whether you&apos;re a business, a driver, a store owner, or just have a question — we&apos;re here to help.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Contact Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          {contactCards.map((card) => (
            <a
              key={card.label}
              href={card.href}
              className="bg-white rounded-card p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block"
            >
              <div
                className={`w-11 h-11 ${card.color} rounded-xl flex items-center justify-center mb-4`}
              >
                <card.icon size={22} className={card.iconColor} />
              </div>
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                {card.label}
              </div>
              <div className="text-navy font-bold text-sm mb-2 break-all">{card.value}</div>
              <p className="text-text-muted text-xs leading-relaxed">{card.desc}</p>
            </a>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-card shadow-sm border border-gray-100 p-8">
              <h2 className="text-navy font-extrabold text-2xl mb-2">Send us a message</h2>
              <p className="text-text-muted text-sm mb-8">
                We typically respond within one business day.
              </p>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-success-green/10 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} className="text-success-green" />
                  </div>
                  <h3 className="text-navy font-bold text-xl mb-2">Message sent!</h3>
                  <p className="text-text-muted text-sm max-w-xs">
                    Thank you for reaching out, {form.name.split(" ")[0]}. We&apos;ll get back to you at{" "}
                    <span className="font-medium text-navy">{form.email}</span> within one business day.
                  </p>
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setForm({ name: "", email: "", subject: "general", message: "" });
                    }}
                    className="mt-6 text-sky hover:underline text-sm font-medium"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-navy font-semibold text-sm mb-1.5"
                      >
                        Full Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Chidi Okeke"
                        className="w-full px-4 py-3 rounded-btn border border-gray-200 bg-off-white focus:outline-none focus:ring-2 focus:ring-sky/30 focus:border-sky text-text-dark text-sm placeholder-text-muted transition-colors"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-navy font-semibold text-sm mb-1.5"
                      >
                        Email Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={form.email}
                        onChange={handleChange}
                        placeholder="chidi@example.com"
                        className="w-full px-4 py-3 rounded-btn border border-gray-200 bg-off-white focus:outline-none focus:ring-2 focus:ring-sky/30 focus:border-sky text-text-dark text-sm placeholder-text-muted transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="subject"
                      className="block text-navy font-semibold text-sm mb-1.5"
                    >
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="subject"
                        name="subject"
                        value={form.subject}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-btn border border-gray-200 bg-off-white focus:outline-none focus:ring-2 focus:ring-sky/30 focus:border-sky text-text-dark text-sm appearance-none cursor-pointer transition-colors"
                      >
                        {subjects.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                          <path d="M1 1L6 6L11 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-navy font-semibold text-sm mb-1.5"
                    >
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={6}
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us how we can help..."
                      className="w-full px-4 py-3 rounded-btn border border-gray-200 bg-off-white focus:outline-none focus:ring-2 focus:ring-sky/30 focus:border-sky text-text-dark text-sm placeholder-text-muted resize-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-sky text-white font-bold py-4 rounded-btn hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={17} />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right: info panels */}
          <div className="lg:col-span-2 space-y-6">
            {/* Location */}
            <div className="bg-white rounded-card shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center">
                  <MapPin size={20} className="text-navy" />
                </div>
                <h3 className="text-navy font-bold">Our Location</h3>
              </div>
              <p className="text-text-muted text-sm leading-relaxed">
                Seirs Logistics Ltd
                <br />
                Lagos, Nigeria
              </p>
              <p className="text-text-muted text-xs mt-3">
                Operations currently active across Lagos and Abuja, with expansion to Port Harcourt and Kano underway.
              </p>
            </div>

            {/* Specific enquiries */}
            <div className="bg-white rounded-card shadow-sm border border-gray-100 p-6">
              <h3 className="text-navy font-bold mb-4">Specific Enquiries</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-sky/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 size={15} className="text-sky" />
                  </div>
                  <div>
                    <div className="text-navy font-semibold text-sm">Businesses</div>
                    <div className="text-text-muted text-xs mt-0.5">
                      Bulk pricing, API docs, dedicated account management
                    </div>
                    <a href="mailto:business@seirs.co" className="text-sky text-xs hover:underline">
                      business@seirs.co
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-sky/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Truck size={15} className="text-sky" />
                  </div>
                  <div>
                    <div className="text-navy font-semibold text-sm">Drivers</div>
                    <div className="text-text-muted text-xs mt-0.5">
                      Application status, onboarding, earnings questions
                    </div>
                    <a href="mailto:support@seirs.co" className="text-sky text-xs hover:underline">
                      support@seirs.co
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-sky/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Store size={15} className="text-sky" />
                  </div>
                  <div>
                    <div className="text-navy font-semibold text-sm">Partner Stores</div>
                    <div className="text-text-muted text-xs mt-0.5">
                      Store onboarding, scanning app, payout queries
                    </div>
                    <a href="mailto:support@seirs.co" className="text-sky text-xs hover:underline">
                      support@seirs.co
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Response time */}
            <div className="bg-navy rounded-card p-6 text-white">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-success-green rounded-full animate-pulse" />
                <span className="text-white/80 text-xs font-medium">Support Status</span>
              </div>
              <h4 className="text-white font-bold mb-1">Currently Online</h4>
              <p className="text-white/60 text-xs leading-relaxed">
                Our team responds within <span className="text-white font-semibold">1 business day</span> for general enquiries and{" "}
                <span className="text-white font-semibold">2 hours</span> for business account holders.
              </p>
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-white/40 text-xs">Support Hours (WAT)</div>
                <div className="text-white/80 text-sm font-medium mt-0.5">
                  Monday – Friday, 8:00am – 6:00pm
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
