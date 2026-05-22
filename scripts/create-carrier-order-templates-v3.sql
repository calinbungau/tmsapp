-- Create Carrier Order Templates (EN and RO) with proper terms and conditions
-- Uses proper newlines (\n) for formatted text blocks

-- First, delete any existing templates with these names to avoid duplicates
DELETE FROM order_templates WHERE name = 'Carrier Order (EN)';
DELETE FROM order_templates WHERE name = 'Comandă de Transport (RO)';

-- Insert English template for all active admins
INSERT INTO order_templates (
  admin_id,
  name,
  template_type,
  is_active,
  is_default,
  html_template
)
SELECT 
  id as admin_id,
  'Carrier Order (EN)' as name,
  'carrier_order' as template_type,
  true as is_active,
  false as is_default,
  '{
    "blocks": [
      {
        "id": "header",
        "type": "company_header",
        "config": {
          "showLogo": true,
          "showAddress": true,
          "showContact": true,
          "showBankDetails": true
        }
      },
      {
        "id": "title",
        "type": "title",
        "config": {
          "text": "CARRIER ORDER",
          "subtitle": "Transport Service Agreement"
        }
      },
      {
        "id": "order_info",
        "type": "order_info",
        "config": {
          "showOrderNumber": true,
          "showDate": true,
          "showCustomerRef": true
        }
      },
      {
        "id": "carrier_section",
        "type": "section",
        "config": {
          "title": "CARRIER DETAILS",
          "fields": [
            {"label": "Company Name", "value": "{{carrier.name}}"},
            {"label": "Address", "value": "{{carrier.address}}"},
            {"label": "VAT Number", "value": "{{carrier.vat_number}}"},
            {"label": "Contact Person", "value": "{{carrier.contact_person}}"},
            {"label": "Phone", "value": "{{carrier.phone}}"},
            {"label": "Email", "value": "{{carrier.email}}"},
            {"label": "Vehicle Reg.", "value": "{{vehicle.plate_number}}"},
            {"label": "Trailer Reg.", "value": "{{trailer.plate_number}}"}
          ]
        }
      },
      {
        "id": "route_section",
        "type": "stops_table",
        "config": {
          "title": "ROUTE DETAILS",
          "showAddress": true,
          "showDate": true,
          "showTime": true,
          "showReference": true,
          "showContact": true
        }
      },
      {
        "id": "cargo_section",
        "type": "section",
        "config": {
          "title": "CARGO DETAILS",
          "fields": [
            {"label": "Description", "value": "{{order.cargo_description}}"},
            {"label": "Weight", "value": "{{order.weight_kg}} kg"},
            {"label": "Pallets", "value": "{{order.pallet_count}}"},
            {"label": "Loading Meters", "value": "{{order.loading_meters}} m"},
            {"label": "Volume", "value": "{{order.volume_m3}} m³"},
            {"label": "ADR Class", "value": "{{order.adr_class}}"},
            {"label": "Temperature", "value": "{{order.temperature_min}}°C - {{order.temperature_max}}°C"}
          ]
        }
      },
      {
        "id": "financial_section",
        "type": "section",
        "config": {
          "title": "FINANCIAL TERMS",
          "fields": [
            {"label": "Freight Rate", "value": "{{order.carrier_cost}} {{order.carrier_currency}}"},
            {"label": "Payment Terms", "value": "{{order.payment_terms_carrier_days}} days from invoice date"}
          ]
        }
      },
      {
        "id": "terms",
        "type": "text_block",
        "config": {
          "title": "GENERAL TERMS AND CONDITIONS",
          "content": "1. PAYMENT TERMS\nPayment is due within {{order.payment_terms_carrier_days}} days from the date of receipt of the invoice in original, along with the CMR consignment notes confirmed without reservations, the delivery notes stamped and signed as proof of delivery, and any customs documents if applicable.\n\n2. INVOICING\nThe invoice shall be issued in {{order.carrier_currency}}, with the equivalent amount in local currency if required. The mailing date of transport documents shall apply. Payment shall be made at the exchange rate of the National Bank on the day of payment.\n\nTHE INVOICE MUST CONTAIN THE ORDER NUMBER.\n\nThe agreed rate includes all costs related to the transport (permits, road taxes, TIR carnet, CMR insurance, preparation of TIR carnet, etc.).\n\n3. TRANSPORT EVENTS\nIn the event of any transport incident, the Carrier reserves the right not to pay the transport value until the final resolution of the matter.\n\n4. REQUIRED DOCUMENTS\nThe Carrier shall provide the following documents to the Principal: invoice in original, 2 CMR in original with stamps from each unloading, delivery notes stamped and signed as proof of receipt, without reservations, export customs declaration in original if applicable. If these documents are not delivered within 30 days from the transport date, 50% of the transport value shall be withheld, plus any damages attributed to the Principal.\n\n5. LIABILITY\nThe Carrier is responsible for total or partial loss or damage to transported goods occurring between the time of receipt and delivery, as well as for delays in delivery, regardless of the cause. The Carrier cannot be exempted from liability even for vehicle defects.\n\nIn case of objections regarding the condition or quantity of goods, the Carrier shall note them on the CMR. If no objections are recorded on the CMR, the goods are considered to have been taken over in accordance with the transport documents, both qualitatively and quantitatively.\n\n6. CMR INSURANCE\nThe Carrier is obligated to insure the transported goods through CMR insurance for a minimum value of EUR 100,000.\n\n7. LOADING/UNLOADING\nLoading and unloading operations are the responsibility of the sender and recipient respectively. The driver must be present and supervise the operations, being responsible for proper securing of goods.\n\n8. DELAYS AND PENALTIES\nDelays in loading/unloading exceeding 24 hours entitle the Carrier to compensation. Delays in delivery may result in penalties as agreed.\n\n9. TEMPERATURE CONTROL\nFor temperature-controlled transport, the Carrier guarantees maintaining the specified temperature range throughout the journey. Temperature records must be provided upon request.\n\n10. CONFIDENTIALITY\nAll information related to this order is confidential and shall not be disclosed to third parties.\n\n11. GDPR COMPLIANCE\nPersonal data will be processed in accordance with applicable data protection regulations.\n\n12. GOVERNING LAW\nThis agreement is governed by the CMR Convention and the laws of the Principal''s country."
        }
      },
      {
        "id": "signatures",
        "type": "signature_block",
        "config": {
          "leftTitle": "FOR THE PRINCIPAL",
          "leftSubtitle": "{{company.name}}",
          "rightTitle": "FOR THE CARRIER",
          "rightSubtitle": "{{carrier.name}}",
          "showDate": true,
          "showStamp": true
        }
      }
    ],
    "pageSettings": {
      "size": "A4",
      "margins": {"top": 20, "right": 20, "bottom": 20, "left": 20},
      "orientation": "portrait"
    },
    "styling": {
      "fontFamily": "Arial, sans-serif",
      "fontSize": "10pt",
      "primaryColor": "#1a365d",
      "borderColor": "#e2e8f0"
    }
  }'::text as html_template
FROM admins
WHERE is_active = true;

-- Insert Romanian template for all active admins
INSERT INTO order_templates (
  admin_id,
  name,
  template_type,
  is_active,
  is_default,
  html_template
)
SELECT 
  id as admin_id,
  'Comandă de Transport (RO)' as name,
  'carrier_order' as template_type,
  true as is_active,
  false as is_default,
  '{
    "blocks": [
      {
        "id": "header",
        "type": "company_header",
        "config": {
          "showLogo": true,
          "showAddress": true,
          "showContact": true,
          "showBankDetails": true
        }
      },
      {
        "id": "title",
        "type": "title",
        "config": {
          "text": "COMANDĂ DE TRANSPORT",
          "subtitle": "Contract de Prestări Servicii Transport"
        }
      },
      {
        "id": "order_info",
        "type": "order_info",
        "config": {
          "showOrderNumber": true,
          "showDate": true,
          "showCustomerRef": true
        }
      },
      {
        "id": "carrier_section",
        "type": "section",
        "config": {
          "title": "DATE TRANSPORTATOR",
          "fields": [
            {"label": "Denumire Firmă", "value": "{{carrier.name}}"},
            {"label": "Adresă", "value": "{{carrier.address}}"},
            {"label": "CUI/CIF", "value": "{{carrier.vat_number}}"},
            {"label": "Persoană de Contact", "value": "{{carrier.contact_person}}"},
            {"label": "Telefon", "value": "{{carrier.phone}}"},
            {"label": "Email", "value": "{{carrier.email}}"},
            {"label": "Nr. Înmatriculare Auto", "value": "{{vehicle.plate_number}}"},
            {"label": "Nr. Înmatriculare Remorcă", "value": "{{trailer.plate_number}}"}
          ]
        }
      },
      {
        "id": "route_section",
        "type": "stops_table",
        "config": {
          "title": "DETALII RUTĂ",
          "showAddress": true,
          "showDate": true,
          "showTime": true,
          "showReference": true,
          "showContact": true,
          "labels": {
            "loading": "Încărcare",
            "unloading": "Descărcare",
            "date": "Data",
            "time": "Ora",
            "address": "Adresă",
            "reference": "Referință"
          }
        }
      },
      {
        "id": "cargo_section",
        "type": "section",
        "config": {
          "title": "DETALII MARFĂ",
          "fields": [
            {"label": "Descriere", "value": "{{order.cargo_description}}"},
            {"label": "Greutate", "value": "{{order.weight_kg}} kg"},
            {"label": "Paleți", "value": "{{order.pallet_count}}"},
            {"label": "Metri Liniari", "value": "{{order.loading_meters}} m"},
            {"label": "Volum", "value": "{{order.volume_m3}} m³"},
            {"label": "Clasă ADR", "value": "{{order.adr_class}}"},
            {"label": "Temperatură", "value": "{{order.temperature_min}}°C - {{order.temperature_max}}°C"}
          ]
        }
      },
      {
        "id": "financial_section",
        "type": "section",
        "config": {
          "title": "CONDIȚII FINANCIARE",
          "fields": [
            {"label": "Tarif Transport", "value": "{{order.carrier_cost}} {{order.carrier_currency}}"},
            {"label": "Termen de Plată", "value": "{{order.payment_terms_carrier_days}} zile de la data facturii"}
          ]
        }
      },
      {
        "id": "terms",
        "type": "text_block",
        "config": {
          "title": "CONDIȚII GENERALE",
          "content": "1. TERMENUL DE PLATĂ\nTermenul de plată este de {{order.payment_terms_carrier_days}} zile de la data primirii facturii în original, a scrisorilor de transport (CMR) confirmate fără rezerve, avizului de însoțire a mărfii și a altor documente de transport în original.\n\n2. FACTURAREA\nFactura va fi emisă în {{order.carrier_currency}}, cu specificarea în subsidiar și a sumei în lei, la data expedierii prin poștă a facturii și a documentelor de transport; plata se va face în lei, la cursul BNR din ziua efectuării plății.\n\nFACTURA VA PURTA OBLIGATORIU MENȚIUNEA PRIVIND NUMĂRUL DE COMANDĂ.\n\nTariful convenit cuprinde toate cheltuielile aferente transportului (autorizații, taxe de drum, carnet TIR, CMR, asigurare CMR, întocmire carnet TIR, etc).\n\n3. EVENIMENTE DE TRANSPORT\nÎn cazul în care apare un eveniment de transport, beneficiarul își rezervă dreptul de a nu achita contravaloarea transportului efectuat, până la soluționarea definitivă a acestuia.\n\n4. DOCUMENTE NECESARE\nTransportatorul va preda beneficiarului următoarele documente: factură în original, 2 CMR în original cu ștampila de la fiecare descărcare, note de livrare semnate și ștampilate de bună-primire, fără rezerve în original, declarație vamală de export, dacă este cazul. În cazul în care aceste documente nu sunt predate în termen de maximum 30 zile de la data efectuării transportului, se va reține 50% din valoarea transportului la care se adaugă daunele imputate de beneficiarul transportului.\n\n5. RĂSPUNDERE\nTransportatorul este răspunzător de pierderea totală sau parțială a mărfii transportate și de avarierea acesteia, produsă între momentul primirii mărfii și cel al descărcării, cât și pentru întârzieri la livrare, indiferent de cauză. Transportatorul nu poate fi exonerat de răspundere nici pentru defectarea vehiculului folosit.\n\nÎn cazul în care există obiecțiuni cu privire la starea mărfurilor sau numărul coletelor Transportatorul va face mențiune în CMR. Dacă nu au fost consemnate obiecțiuni în CMR se consideră că marfa a fost preluată corespunzător actelor de transport, atât calitativ cât și cantitativ.\n\n6. ASIGURARE CMR\nTransportatorul are obligația să asigure marfa transportată prin încheierea asigurării CMR pentru valoarea minimă de 100.000 Euro.\n\n7. ÎNCĂRCARE/DESCĂRCARE\nOperațiunile de încărcare și descărcare sunt în sarcina expeditorului, respectiv destinatarului. Șoferul trebuie să fie prezent și să supravegheze operațiunile, fiind responsabil pentru fixarea corespunzătoare a mărfurilor.\n\n8. ÎNTÂRZIERI ȘI PENALITĂȚI\nÎntârzierile la încărcare/descărcare care depășesc 24 de ore dau dreptul la compensații. Întârzierile la livrare pot atrage penalități conform acordului.\n\n9. CONTROL TEMPERATURĂ\nPentru transporturile cu temperatură controlată, Transportatorul garantează menținerea intervalului de temperatură specificat pe toată durata călătoriei. Înregistrările de temperatură trebuie furnizate la cerere.\n\n10. CONFIDENȚIALITATE\nToate informațiile legate de această comandă sunt confidențiale și nu vor fi divulgate terților.\n\n11. CONFORMITATE GDPR\nDatele personale vor fi prelucrate în conformitate cu reglementările aplicabile privind protecția datelor.\n\n12. LEGEA APLICABILĂ\nAcest acord este guvernat de Convenția CMR și legile din țara Beneficiarului."
        }
      },
      {
        "id": "signatures",
        "type": "signature_block",
        "config": {
          "leftTitle": "PENTRU BENEFICIAR",
          "leftSubtitle": "{{company.name}}",
          "rightTitle": "PENTRU TRANSPORTATOR", 
          "rightSubtitle": "{{carrier.name}}",
          "showDate": true,
          "showStamp": true,
          "dateLabel": "Data",
          "stampLabel": "Ștampilă"
        }
      }
    ],
    "pageSettings": {
      "size": "A4",
      "margins": {"top": 20, "right": 20, "bottom": 20, "left": 20},
      "orientation": "portrait"
    },
    "styling": {
      "fontFamily": "Arial, sans-serif",
      "fontSize": "10pt",
      "primaryColor": "#1a365d",
      "borderColor": "#e2e8f0"
    }
  }'::text as html_template
FROM admins
WHERE is_active = true;
