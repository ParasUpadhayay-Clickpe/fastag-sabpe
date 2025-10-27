import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FASTag - Fast, Secure FASTag Recharge",
  description: "Recharge FASTag securely and instantly with SabPe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.className} antialiased bg-lightBg text-gray-800 min-h-screen flex flex-col font-sans`}>
        <header className="bg-white shadow-lg sticky top-0 z-50 rounded-b-xl">
          <div className="container mx-auto flex justify-between items-center p-4">
            <Link href="/" className="flex items-center">
              <div className="bg-primary p-3 rounded-lg mr-3 shadow-md">🚗</div>
              <span className="text-2xl font-bold text-primary">FASTag</span>
            </Link>
            <nav className="hidden md:flex items-center space-x-8">
              <a href="/#hero" className="font-medium text-gray-700 hover:text-primary transition duration-300">Home</a>
              <a href="/#about-us" className="font-medium text-gray-700 hover:text-primary transition duration-300">About Us</a>
              <a href="/#contact-us" className="font-medium text-gray-700 hover:text-primary transition duration-300">Contact</a>
              <Link href="/fastag-recharge" className="font-medium text-gray-700 hover:text-primary transition duration-300">Recharge</Link>
            </nav>
            <button className="md:hidden text-gray-600 focus:outline-none">☰</button>
          </div>
        </header>

        <main className="flex-grow w-full">{children}</main>

        <footer className="bg-dark text-white pt-16 pb-8 rounded-t-3xl shadow-inner">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
              <div>
                <div className="flex items-center mb-6">
                  <div className="bg-primary p-3 rounded-lg mr-3 shadow-md">🚗</div>
                  <h3 className="text-2xl font-bold">FASTag</h3>
                </div>
                <p className="text-gray-400 mb-6 leading-relaxed">Fast, secure FASTag recharge with a clean, guided experience.</p>
                <div className="flex space-x-5 mt-6 text-xl">
                  <a href="#" className="text-gray-400 hover:text-accent transition duration-300">𝕗</a>
                  <a href="#" className="text-gray-400 hover:text-accent transition duration-300">𝕏</a>
                  <a href="#" className="text-gray-400 hover:text-accent transition duration-300">in</a>
                  <a href="#" className="text-gray-400 hover:text-accent transition duration-300">◎</a>
                </div>
              </div>
              <div>
                <h4 className="text-xl font-bold mb-6 text-accent">Quick Links</h4>
                <ul className="space-y-3 text-gray-400">
                  <li><Link href="/terms-and-conditions" className="hover:text-white transition duration-300">Terms and Conditions</Link></li>
                  <li><Link href="/privacy-policy" className="hover:text-white transition duration-300">Privacy Policy</Link></li>
                  <li><Link href="/refund-policy" className="hover:text-white transition duration-300">Refund Policy</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xl font-bold mb-6 text-accent">Contact Us</h4>
                <ul className="space-y-4 text-gray-400">
                  <li className="flex items-start">📍<span className="ml-3">UG 150, Marvella Corridor, VIP Road, Vesu, Surat -  395007</span></li>
                  <li className="flex items-center">📞<span className="ml-3">+91 93272 82729</span></li>
                  <li className="flex items-center">✉️<span className="ml-3">support@sabpe.com</span></li>
                  <li className="flex items-center">⏰<span className="ml-3">Mon-Sat: 9:00 AM - 6:00 PM</span></li>
                </ul>
              </div>
            </div>
            <div className="pt-8 border-t border-gray-800">
              <div className="flex flex-col md:flex-row justify-between items-center">
                <p className="text-gray-500 text-sm">© {new Date().getFullYear()} SabPe. All rights reserved.</p>
                <div className="flex space-x-8 mt-4 md:mt-0">
                  <Link href="/privacy-policy" className="text-gray-500 hover:text-white transition duration-300">Privacy Policy</Link>
                  <Link href="/terms-and-conditions" className="text-gray-500 hover:text-white transition duration-300">Terms of Service</Link>
                  <Link href="/refund-policy" className="text-gray-500 hover:text-white transition duration-300">Refund Policy</Link>
                </div>
              </div>
              <p className="text-gray-600 text-center mt-6 text-sm">KB ToPay Finovative LLP</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
