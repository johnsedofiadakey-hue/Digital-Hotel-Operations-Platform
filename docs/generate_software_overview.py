"""
DHOP Software Overview — branded PDF for Stormglide.io
Built with reportlab. Content describes the actual, built system only —
no fabricated customer stats, no invented pricing, nothing that isn't real.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    FrameBreak, NextPageTemplate, PageBreak, KeepTogether, HRFlowable,
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as canvas_mod

# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------
NAVY = HexColor("#10182B")
NAVY_SOFT = HexColor("#3A4258")
BLUE = HexColor("#2F6FEF")
BLUE_SOFT = HexColor("#EAF0FE")
CREAM = HexColor("#FAFAF9")
GREY = HexColor("#6B7280")
LINE = HexColor("#E4E6EC")
WHITE = HexColor("#FFFFFF")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm

DEVELOPER = "John Dakey"
COMPANY = "Stormglide.io"
EMAIL = "john@stormglide.io"
WEBSITE = "stormglide.io"


def draw_mark(c, x, y, size=10, dark=NAVY, accent=BLUE):
    """The Stormglide mark: two offset squares forming a small plus/grid glyph."""
    s = size
    c.saveState()
    c.setFillColor(dark)
    c.roundRect(x, y, s * 0.62, s * 0.62, s * 0.12, fill=1, stroke=0)
    c.roundRect(x + s * 0.72, y + s * 0.72, s * 0.5, s * 0.5, s * 0.1, fill=1, stroke=0)
    c.setFillColor(accent)
    c.roundRect(x + s * 0.78, y - s * 0.02, s * 0.42, s * 0.42, s * 0.09, fill=1, stroke=0)
    c.restoreState()


def draw_wordmark(c, x, y, size=13, dark=NAVY, accent=BLUE, bold=True):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.saveState()
    c.setFont(font, size)
    c.setFillColor(dark)
    c.drawString(x, y, "stormglide")
    w = c.stringWidth("stormglide", font, size)
    c.setFillColor(accent)
    c.drawString(x + w, y, ".io")
    c.restoreState()


# ---------------------------------------------------------------------------
# Page templates: cover (no header/footer chrome) + content (running header/footer)
# ---------------------------------------------------------------------------

def cover_page(c: canvas_mod.Canvas, doc):
    c.saveState()
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # subtle accent block, top-right
    c.setFillColor(HexColor("#182036"))
    c.rect(PAGE_W - 70 * mm, PAGE_H - 90 * mm, 70 * mm, 90 * mm, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(PAGE_W - 3 * mm, PAGE_H - 90 * mm, 3 * mm, 90 * mm, fill=1, stroke=0)

    # mark + wordmark, top-left
    draw_mark(c, MARGIN, PAGE_H - 30 * mm, size=11, dark=WHITE, accent=BLUE)
    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(WHITE)
    c.drawString(MARGIN + 16, PAGE_H - 30 * mm + 1, "stormglide")
    w = c.stringWidth("stormglide", "Helvetica-Bold", 13)
    c.setFillColor(BLUE)
    c.drawString(MARGIN + 16 + w, PAGE_H - 30 * mm + 1, ".io")

    # Big product mark
    draw_mark(c, MARGIN, PAGE_H - 110 * mm, size=22, dark=WHITE, accent=BLUE)
    c.setFont("Helvetica-Bold", 44)
    c.setFillColor(WHITE)
    c.drawString(MARGIN, PAGE_H - 128 * mm, "DHOP")

    c.setFont("Helvetica", 15)
    c.setFillColor(HexColor("#C7CCDA"))
    c.drawString(MARGIN, PAGE_H - 137 * mm, "Digital Hotel Operations Platform")

    c.setStrokeColor(BLUE)
    c.setLineWidth(1.2)
    c.line(MARGIN, PAGE_H - 145 * mm, MARGIN + 60 * mm, PAGE_H - 145 * mm)

    c.setFont("Helvetica", 11)
    c.setFillColor(HexColor("#9AA2B6"))
    c.drawString(MARGIN, PAGE_H - 153 * mm, "Software Overview & Feature Guide")

    # Footer block: prepared by / developer / contact
    fy = 32 * mm
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#9AA2B6"))
    c.drawString(MARGIN, fy, "PREPARED BY")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(WHITE)
    c.drawString(MARGIN, fy - 6 * mm, "Stormglide.io")

    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#9AA2B6"))
    c.drawString(MARGIN + 70 * mm, fy, "DEVELOPER")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(WHITE)
    c.drawString(MARGIN + 70 * mm, fy - 6 * mm, DEVELOPER)

    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#9AA2B6"))
    c.drawString(MARGIN + 130 * mm, fy, "CONTACT")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(WHITE)
    c.drawString(MARGIN + 130 * mm, fy - 6 * mm, EMAIL)

    c.restoreState()


def content_chrome(c: canvas_mod.Canvas, doc):
    c.saveState()
    # header
    draw_mark(c, MARGIN, PAGE_H - 18 * mm, size=7, dark=NAVY, accent=BLUE)
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(NAVY)
    c.drawString(MARGIN + 11, PAGE_H - 18 * mm + 1.5, "stormglide")
    w = c.stringWidth("stormglide", "Helvetica-Bold", 9.5)
    c.setFillColor(BLUE)
    c.drawString(MARGIN + 11 + w, PAGE_H - 18 * mm + 1.5, ".io")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(GREY)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 18 * mm + 1.5, "DHOP — Software Overview")

    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 22 * mm, PAGE_W - MARGIN, PAGE_H - 22 * mm)

    # footer
    c.setStrokeColor(LINE)
    c.line(MARGIN, 15 * mm, PAGE_W - MARGIN, 15 * mm)
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawString(MARGIN, 10 * mm, f"{COMPANY}  ·  {EMAIL}")
    c.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build_doc(filename):
    doc = BaseDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    content_frame = Frame(
        MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 6 * mm,
        id="content",
    )

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="Content", frames=[content_frame], onPage=content_chrome),
    ])

    return doc


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
styles = {
    "H1": ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=20, textColor=NAVY,
                          spaceBefore=0, spaceAfter=10, leading=24),
    "Kicker": ParagraphStyle("Kicker", fontName="Helvetica-Bold", fontSize=9, textColor=BLUE,
                              spaceAfter=4, leading=11, tracking=1),
    "H2": ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, textColor=NAVY,
                          spaceBefore=14, spaceAfter=6, leading=16),
    "H3": ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=10.5, textColor=NAVY,
                          spaceBefore=8, spaceAfter=3, leading=13),
    "Body": ParagraphStyle("Body", fontName="Helvetica", fontSize=9.7, textColor=NAVY_SOFT,
                            leading=14.5, spaceAfter=6, alignment=TA_LEFT),
    "BodyLarge": ParagraphStyle("BodyLarge", fontName="Helvetica", fontSize=11, textColor=NAVY_SOFT,
                                 leading=16.5, spaceAfter=8),
    "Bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=9.5, textColor=NAVY_SOFT,
                              leading=14, spaceAfter=4, leftIndent=12, bulletIndent=0),
    "Caption": ParagraphStyle("Caption", fontName="Helvetica-Oblique", fontSize=8.5, textColor=GREY,
                               leading=12),
    "TileTitle": ParagraphStyle("TileTitle", fontName="Helvetica-Bold", fontSize=10, textColor=NAVY,
                                 leading=13, spaceAfter=2),
    "TileBody": ParagraphStyle("TileBody", fontName="Helvetica", fontSize=8.7, textColor=GREY,
                                leading=12.5),
}


def bullets(items):
    return [Paragraph(f"&bull;&nbsp;&nbsp;{t}", styles["Bullet"]) for t in items]


def feature_table(rows, col_widths=(58 * mm, None)):
    """Two-column: bold label | description, used for portal feature lists."""
    data = []
    for label, desc in rows:
        data.append([
            Paragraph(f"<b>{label}</b>", styles["H3"]),
            Paragraph(desc, styles["Body"]),
        ])
    t = Table(data, colWidths=[col_widths[0], (PAGE_W - 2 * MARGIN - col_widths[0])])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]))
    return t


def section_header(kicker, title):
    return [Paragraph(kicker.upper(), styles["Kicker"]), Paragraph(title, styles["H1"]),
            HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=12)]


def portal_tile(title, sub, icon_color=BLUE):
    data = [[Paragraph(f"<b>{title}</b>", styles["TileTitle"]), ""],
            [Paragraph(sub, styles["TileBody"]), ""]]
    t = Table(data, colWidths=[(PAGE_W - 2 * MARGIN - 12 * mm) / 3.0, 0])
    return t


# ---------------------------------------------------------------------------
# Build story
# ---------------------------------------------------------------------------
story = []

# ---- COVER ----
story.append(Spacer(1, 1))  # placeholder flowable for cover frame (chrome drawn in onPage)
story.append(NextPageTemplate("Content"))
story.append(PageBreak())

# ---- 1. What is DHOP ----
story += section_header("Executive Summary", "What DHOP Is")
story.append(Paragraph(
    "DHOP (Digital Hotel Operations Platform) replaces the WhatsApp groups, printed door "
    "hangers, and phone calls that most independent hotels run on today with one shared, "
    "live system. Reception, housekeeping, kitchen, and guests all read and write the same "
    "real-time board — a request raised in a guest's room reaches the right department "
    "instantly, and a room marked clean updates everywhere at once.",
    styles["BodyLarge"]))
story.append(Paragraph(
    "The platform is built around three connected portals — a guest portal, a staff portal, "
    "and an owner/manager portal — all reading from and writing to the same database in "
    "real time, and a payments layer built MoMo-first for the Ghanaian market rather than as "
    "an afterthought.",
    styles["Body"]))

story.append(Spacer(1, 6 * mm))
story.append(Paragraph("Three Portals, One Live System", styles["H2"]))
story.append(feature_table([
    ("Guest Portal", "A mobile web portal every guest reaches by scanning the QR code in "
                      "their room — no app to download, no password to remember. Guests order "
                      "food, raise requests, chat with reception, book activities, and view "
                      "their bill in real time."),
    ("Staff Portal", "A shared installable web app used at reception, in the kitchen, and by "
                      "housekeeping and maintenance staff. Fast PIN tap-in on shared tablets, "
                      "with every action attributed to the staff member who performed it."),
    ("Owner / Manager Portal", "A secured login (email and password) for hotel owners and "
                                "branch managers to manage staff accounts, oversee occupancy "
                                "and open requests, and — for hotel groups — manage multiple "
                                "properties from one place."),
]))

story.append(PageBreak())

# ---- 2. How It Works ----
story += section_header("System Overview", "How The System Works")
story.append(Paragraph(
    "Every part of DHOP is connected through one shared database with real-time updates, so "
    "no one is ever waiting on a phone call to find out what's already happened elsewhere in "
    "the hotel.",
    styles["BodyLarge"]))

story.append(Paragraph("The guest journey", styles["H2"]))
story += bullets([
    "<b>Arrival</b> — Reception checks the guest in at the desk (under a minute). The room's "
    "QR code immediately becomes active for that guest's stay.",
    "<b>Access</b> — The guest scans the code in their room and lands directly in their own "
    "portal. A second device (a partner's phone) can join by entering the guest's last name "
    "and the room code — with reduced access until it's confirmed from inside the room.",
    "<b>During the stay</b> — Every request, order, or message the guest sends appears "
    "instantly on the relevant staff screen. Every reply and status update appears instantly "
    "back in the guest's portal.",
    "<b>Departure</b> — The guest checks out (or reception does it for them), their bill "
    "settles, their session on every device closes automatically, and the room is handed to "
    "housekeeping the same moment.",
])

story.append(Paragraph("The staff experience", styles["H2"]))
story.append(Paragraph(
    "Staff tap in with a 4-digit PIN on a shared tablet at their station. Every department "
    "works from the same live Room Status Board and request queues — a room marked “dirty” "
    "by housekeeping is visible to reception the same instant, with no call required.",
    styles["Body"]))

story.append(Paragraph("The manager view", styles["H2"]))
story.append(Paragraph(
    "Owners and branch managers sign in separately, with a real password-protected account, "
    "to add and manage staff, and to see occupancy and open-request activity across their "
    "property (or properties) at a glance.",
    styles["Body"]))

story.append(PageBreak())

# ---- 3. Guest Portal ----
story += section_header("Portal 1 of 3", "The Guest Portal")
story.append(Paragraph(
    "Designed around a simple rule: guests should never need to install anything or "
    "remember a password to get help during their stay.",
    styles["BodyLarge"]))

story.append(Paragraph("Getting in", styles["H2"]))
story += bullets([
    "<b>QR check-in</b> — scan the code printed in the room and the portal opens instantly, "
    "already linked to that guest's stay and bill.",
    "<b>Second-device access</b> — a travelling companion can join from their own phone with "
    "just the guest's last name and the room's code.",
    "<b>Tiered access</b> — a device that scanned the physical room code gets full access "
    "(including the live bill and checkout); a second device joined remotely gets everything "
    "except billing, protecting the guest from anyone else who happens to know the room "
    "number.",
])

story.append(Paragraph("What guests can do", styles["H2"]))
story.append(feature_table([
    ("Room requests", "Housekeeping, maintenance, and laundry requests — submitted in seconds "
                       "and tracked through to completion, with the option to reopen if "
                       "something wasn't actually resolved."),
    ("Food &amp; beverage", "A live menu, organised by category, with items instantly marked "
                             "sold out across every guest's screen the moment the kitchen runs "
                             "out. Orders can be paid immediately or charged to the room."),
    ("Live bill", "Every charge appears the moment it's placed — no surprise at checkout."),
    ("Activities &amp; facilities", "Spa, tours, and other bookable experiences with live "
                                     "availability, so two guests can never accidentally book "
                                     "the same slot."),
    ("Chat with reception", "A direct line to the front desk for anything that doesn't fit a "
                             "request form."),
    ("Tipping", "A simple way to tip staff directly through the portal."),
    ("Lost &amp; found", "Report a lost item, or check what's been handed in."),
    ("ID upload", "A secure way to submit ID during check-in, visible only to reception."),
    ("Express checkout", "Settle the bill and check out without a trip to the front desk."),
    ("Guest profile &amp; return stays", "Guests can opt in to have their details remembered "
                                          "for a faster check-in next time — fully deletable on "
                                          "request."),
]))

story.append(PageBreak())

# ---- 4. Staff Portal ----
story += section_header("Portal 2 of 3", "The Staff Portal")
story.append(Paragraph(
    "One shared app for every department, installed on shared tablets and personal phones, "
    "built around fast tap-in and a live view of what's happening across the property.",
    styles["BodyLarge"]))

story.append(Paragraph("Signing in", styles["H2"]))
story.append(Paragraph(
    "Staff tap in with a 4-digit PIN on a shared tablet. Every action is attributed to that "
    "staff member specifically, even on a device the whole department shares, and the device "
    "logs itself out automatically after a short period of inactivity.",
    styles["Body"]))

story.append(Paragraph("By department", styles["H2"]))
story.append(feature_table([
    ("Reception", "Check guests in and out, see the live Room Status Board, manage "
                  "reservations, and read every guest conversation in one inbox."),
    ("Housekeeping &amp; Maintenance", "A shared request queue that automatically routes new "
                                        "requests to whichever available staff member has the "
                                        "lightest workload, and updates the Room Status Board "
                                        "the moment a room is marked clean."),
    ("Kitchen", "A live order queue with a sold-out toggle that updates every guest's menu "
                "instantly, and low-stock alerts before an item runs out completely."),
    ("Concierge", "The same guest chat inbox reception uses, for handling local "
                  "recommendations and general guest questions."),
    ("Finance", "Deposit and incidental-hold management tied directly to each guest's bill."),
]))

story.append(Paragraph("For managers", styles["H2"]))
story += bullets([
    "<b>Room Status Board</b> — the live, shared source of truth every department reads from.",
    "<b>Reports</b> — occupancy and average response-time snapshots by department.",
    "<b>Audit log</b> — a full record of who did what and when, across the property.",
    "<b>Reservations &amp; calendar</b> — a combined view of upcoming arrivals and activity "
    "bookings.",
    "<b>Built for real conditions</b> — housekeeping and maintenance actions keep working "
    "through a dropped Wi-Fi connection and sync automatically once it's back.",
])

story.append(PageBreak())

# ---- 5. Admin / Owner Portal ----
story += section_header("Portal 3 of 3", "The Owner &amp; Manager Portal")
story.append(Paragraph(
    "A separate, more formally secured application for the people responsible for the "
    "business itself, not day-to-day operations.",
    styles["BodyLarge"]))

story.append(Paragraph("What it does today", styles["H2"]))
story.append(feature_table([
    ("Secure sign-in", "A real email-and-password account for every Owner and Branch "
                        "Manager — separate from the PIN tap-in staff use on shared "
                        "tablets."),
    ("Staff management", "Add a new staff member, assign their department and role, set "
                          "their tap-in PIN, and switch off their access instantly the moment "
                          "they leave — no waiting, no manual database work."),
    ("Branch overview", "A live snapshot of occupancy and open requests for every branch a "
                         "manager or owner is responsible for."),
    ("Built for multi-property growth", "The same account structure already supports an "
                                         "owner overseeing several branches from one login as "
                                         "a hotel group grows."),
]))
story.append(Paragraph(
    "Deeper analytics — revenue comparisons, guest satisfaction trends, and full "
    "multi-branch reporting — are the natural next layer to build on top of this foundation "
    "as the business grows.",
    styles["Caption"]))

story.append(PageBreak())

# ---- 6. Security & Trust ----
story += section_header("How Guest & Business Data Is Protected", "Security &amp; Trust")
story += bullets([
    "<b>Every hotel's data is isolated.</b> A property can never see another property's "
    "guests, staff, or bookings — enforced at the database level, not just in the app.",
    "<b>Every action is logged.</b> Check-ins, room-status changes, and staff account changes "
    "are all recorded in an audit trail.",
    "<b>Guest access expires automatically.</b> A guest's session closes the moment they "
    "check out, so the next guest in that room can never see a previous guest's bill or "
    "conversation history.",
    "<b>Billing is protected by design.</b> Only a device that scanned the physical room QR "
    "code can ever view or settle the bill — a device that joined remotely cannot, even with "
    "the guest's name and room number.",
    "<b>Staff see only what their role allows.</b> A kitchen tablet cannot see housekeeping "
    "tasks; a department manager sees their department, not the whole property, unless "
    "granted broader access.",
])

story.append(Paragraph("Payments", styles["H2"]))
story.append(Paragraph(
    "Payments are built Mobile-Money-first, because that's how Ghana actually pays — MTN "
    "Mobile Money, Vodafone Cash, and AirtelTigo Money are all supported through a single "
    "integration, alongside card payments. Guests can pay per order or charge to their room "
    "and settle everything at checkout.",
    styles["Body"]))

story.append(PageBreak())

# ---- Closing ----
story.append(Spacer(1, 40 * mm))
story.append(Paragraph("Let's Talk", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=14))
story.append(Paragraph(
    "This document describes DHOP as it exists today — every feature listed above is built "
    "and working. We'd welcome the chance to walk you through it live.",
    styles["BodyLarge"]))
story.append(Spacer(1, 10 * mm))
story.append(feature_table([
    ("Developer", DEVELOPER),
    ("Company", COMPANY),
    ("Email", EMAIL),
    ("Website", WEBSITE),
]))

# ---------------------------------------------------------------------------
import os

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DHOP_Software_Overview.pdf")
doc = build_doc(OUTPUT_PATH)
doc.build(story)
print(f"done -> {OUTPUT_PATH}")
