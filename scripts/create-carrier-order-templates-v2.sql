-- Create/Update Carrier Order Templates with proper formatting
-- This script creates both English and Romanian templates with proper newline handling

-- First, delete existing templates with these names to avoid duplicates
DELETE FROM order_templates WHERE name IN ('Carrier Order (EN)', 'Comandă de Transport (RO)');

-- Insert English Carrier Order Template
INSERT INTO order_templates (admin_id, name, description, html_template, is_default, created_at, updated_at)
SELECT 
  a.id as admin_id,
  'Carrier Order (EN)' as name,
  'Standard carrier order template in English with terms and conditions' as description,
  '{
    "pageSize": "A4",
    "pageMargins": [40, 40, 40, 40],
    "headerHeight": 80,
    "footerHeight": 40,
    "showHeader": true,
    "showFooter": true,
    "blocks": [
      {
        "id": "header",
        "type": "header",
        "content": {
          "companyName": "{{company.name}}",
          "showLogo": true,
          "logoPosition": "left",
          "address": "{{company.address}}",
          "contactInfo": "Tel: {{company.phone}} | Email: {{company.email}}",
          "registrationInfo": "VAT: {{company.vat}} | Reg. No: {{company.registration_number}}"
        },
        "style": {
          "backgroundColor": "#ffffff",
          "borderBottom": "2px solid #1a365d",
          "padding": "15px 20px"
        }
      },
      {
        "id": "title",
        "type": "title",
        "content": {
          "text": "CARRIER ORDER",
          "subtitle": "No. {{order.reference_number}} / {{order.date}}"
        },
        "style": {
          "fontSize": "22px",
          "fontWeight": "bold",
          "textAlign": "center",
          "color": "#1a365d",
          "marginTop": "20px",
          "marginBottom": "20px"
        }
      },
      {
        "id": "carrier-info",
        "type": "section",
        "content": {
          "title": "CARRIER DETAILS",
          "fields": [
            {"label": "Company", "value": "{{carrier.name}}"},
            {"label": "Address", "value": "{{carrier.address}}"},
            {"label": "VAT Number", "value": "{{carrier.vat}}"},
            {"label": "Contact Person", "value": "{{carrier.contact_name}}"},
            {"label": "Phone", "value": "{{carrier.phone}}"},
            {"label": "Email", "value": "{{carrier.email}}"},
            {"label": "Vehicle Reg.", "value": "{{vehicle.plate_number}}"},
            {"label": "Trailer Reg.", "value": "{{vehicle.trailer_plate}}"},
            {"label": "Driver", "value": "{{driver.name}} | {{driver.phone}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "route-details",
        "type": "section",
        "content": {
          "title": "ROUTE DETAILS",
          "fields": [
            {"label": "Loading Point", "value": "{{stops.loading.address}}"},
            {"label": "Loading Date", "value": "{{stops.loading.date}} {{stops.loading.time_window}}"},
            {"label": "Loading Reference", "value": "{{stops.loading.reference}}"},
            {"label": "Unloading Point", "value": "{{stops.unloading.address}}"},
            {"label": "Unloading Date", "value": "{{stops.unloading.date}} {{stops.unloading.time_window}}"},
            {"label": "Unloading Reference", "value": "{{stops.unloading.reference}}"},
            {"label": "Distance", "value": "{{order.distance_km}} km"},
            {"label": "Transit Time", "value": "{{order.transit_time}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "cargo-details",
        "type": "section",
        "content": {
          "title": "CARGO DETAILS",
          "fields": [
            {"label": "Cargo Type", "value": "{{cargo.type}}"},
            {"label": "Description", "value": "{{cargo.description}}"},
            {"label": "Weight", "value": "{{cargo.weight}} kg"},
            {"label": "Dimensions", "value": "{{cargo.dimensions}}"},
            {"label": "Loading Meters", "value": "{{cargo.loading_meters}} LDM"},
            {"label": "Packages", "value": "{{cargo.packages}}"},
            {"label": "ADR/Hazardous", "value": "{{cargo.adr_class}}"},
            {"label": "Temperature", "value": "{{cargo.temperature_requirements}}"},
            {"label": "Special Instructions", "value": "{{cargo.special_instructions}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "financial",
        "type": "section",
        "content": {
          "title": "FINANCIAL TERMS",
          "fields": [
            {"label": "Agreed Price", "value": "{{order.carrier_price}} {{order.carrier_currency}}"},
            {"label": "Payment Terms", "value": "{{order.payment_days}} days from invoice date"},
            {"label": "Invoice Requirements", "value": "Original CMR, delivery notes, POD"}
          ]
        },
        "style": {
          "backgroundColor": "#fef3c7",
          "border": "1px solid #f59e0b",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "20px"
        }
      },
      {
        "id": "terms",
        "type": "text",
        "content": {
          "title": "GENERAL TERMS AND CONDITIONS",
          "text": "1. PAYMENT TERMS\nPayment shall be made within {{order.payment_days}} days from receipt of the original invoice, CMR consignment notes confirmed without reservations, delivery notes, and all other original transport documents.\n\n2. INVOICING\nThe invoice shall be issued in {{order.carrier_currency}}, with subsidiary specification of the amount in local currency, on the date of dispatch of the invoice and transport documents. Payment in local currency shall be made at the central bank exchange rate on the day of payment.\n\n**THE INVOICE MUST CONTAIN THE ORDER NUMBER.**\n\nThe agreed rate includes all transport-related expenses (permits, road taxes, TIR carnet, CMR insurance, TIR carnet preparation, etc.).\n\n3. DISPUTES\nIn case of a transport incident, the Beneficiary reserves the right not to pay the transport value until the definitive resolution of the matter.\n\n4. DOCUMENT REQUIREMENTS\nThe Carrier shall deliver the following documents to the Beneficiary: original invoice, 2 original CMR with stamps from each unloading point, signed and stamped delivery notes of good receipt, without reservations, original export customs declaration if applicable. If these documents are not delivered within a maximum of 30 days from the transport date, 50% of the transport value shall be retained, to which damages charged to the Beneficiary shall be added.\n\n5. CARRIER LIABILITY\nThe Carrier is responsible for total or partial loss of transported goods and for any damage thereto, occurring between the time of receipt and delivery, as well as for delays in delivery, regardless of cause. The Carrier cannot be exempt from liability even for vehicle defects.\n\nIn case of objections regarding the condition of goods or number of packages, the Carrier shall note these in the CMR. If no objections are recorded in the CMR, it is considered that the goods were taken over in accordance with the transport documents, both qualitatively and quantitatively.\n\n6. INSURANCE\nThe Carrier is obliged to insure the transported goods by concluding CMR insurance for a minimum value of EUR 100,000.\n\n7. TEMPERATURE CONTROL\nFor temperature-controlled transports, the Carrier must maintain the required temperature throughout the journey and provide temperature records upon delivery.\n\n8. COMPLIANCE\nThe Carrier confirms compliance with all applicable transport regulations, including driving time restrictions, vehicle roadworthiness, and proper licensing.\n\n9. CONFIDENTIALITY\nAll information related to this transport order shall be treated as confidential and shall not be disclosed to third parties without prior written consent.\n\n10. GOVERNING LAW\nThis agreement shall be governed by the CMR Convention and applicable national transport laws."
        },
        "style": {
          "fontSize": "9px",
          "lineHeight": "1.5",
          "textAlign": "justify",
          "padding": "15px",
          "backgroundColor": "#ffffff",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "marginBottom": "20px",
          "whiteSpace": "pre-wrap"
        }
      },
      {
        "id": "signatures",
        "type": "signatures",
        "content": {
          "columns": [
            {
              "title": "BENEFICIARY",
              "companyName": "{{company.name}}",
              "signatureLine": true,
              "dateLine": true,
              "stampPlaceholder": true
            },
            {
              "title": "CARRIER",
              "companyName": "{{carrier.name}}",
              "signatureLine": true,
              "dateLine": true,
              "stampPlaceholder": true
            }
          ]
        },
        "style": {
          "marginTop": "30px",
          "paddingTop": "20px"
        }
      },
      {
        "id": "footer",
        "type": "footer",
        "content": {
          "text": "This document was generated automatically. Order: {{order.reference_number}} | Page {{page}} of {{pages}}"
        },
        "style": {
          "fontSize": "8px",
          "color": "#6b7280",
          "textAlign": "center",
          "borderTop": "1px solid #e2e8f0",
          "paddingTop": "10px"
        }
      }
    ]
  }'::jsonb as html_template,
  false as is_default,
  NOW() as created_at,
  NOW() as updated_at
FROM admins a
WHERE a.status = 'active';

-- Insert Romanian Carrier Order Template with proper newlines
INSERT INTO order_templates (admin_id, name, description, html_template, is_default, created_at, updated_at)
SELECT 
  a.id as admin_id,
  'Comandă de Transport (RO)' as name,
  'Șablon standard pentru comanda de transport în limba română cu termeni și condiții' as description,
  '{
    "pageSize": "A4",
    "pageMargins": [40, 40, 40, 40],
    "headerHeight": 80,
    "footerHeight": 40,
    "showHeader": true,
    "showFooter": true,
    "blocks": [
      {
        "id": "header",
        "type": "header",
        "content": {
          "companyName": "{{company.name}}",
          "showLogo": true,
          "logoPosition": "left",
          "address": "{{company.address}}",
          "contactInfo": "Tel: {{company.phone}} | Email: {{company.email}}",
          "registrationInfo": "CUI: {{company.vat}} | Nr. Reg. Com.: {{company.registration_number}}"
        },
        "style": {
          "backgroundColor": "#ffffff",
          "borderBottom": "2px solid #1a365d",
          "padding": "15px 20px"
        }
      },
      {
        "id": "title",
        "type": "title",
        "content": {
          "text": "COMANDĂ DE TRANSPORT",
          "subtitle": "Nr. {{order.reference_number}} / {{order.date}}"
        },
        "style": {
          "fontSize": "22px",
          "fontWeight": "bold",
          "textAlign": "center",
          "color": "#1a365d",
          "marginTop": "20px",
          "marginBottom": "20px"
        }
      },
      {
        "id": "carrier-info",
        "type": "section",
        "content": {
          "title": "DATE TRANSPORTATOR",
          "fields": [
            {"label": "Companie", "value": "{{carrier.name}}"},
            {"label": "Adresă", "value": "{{carrier.address}}"},
            {"label": "CUI", "value": "{{carrier.vat}}"},
            {"label": "Persoană de contact", "value": "{{carrier.contact_name}}"},
            {"label": "Telefon", "value": "{{carrier.phone}}"},
            {"label": "Email", "value": "{{carrier.email}}"},
            {"label": "Nr. Auto", "value": "{{vehicle.plate_number}}"},
            {"label": "Nr. Remorcă", "value": "{{vehicle.trailer_plate}}"},
            {"label": "Șofer", "value": "{{driver.name}} | {{driver.phone}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "route-details",
        "type": "section",
        "content": {
          "title": "DETALII RUTĂ",
          "fields": [
            {"label": "Punct Încărcare", "value": "{{stops.loading.address}}"},
            {"label": "Data Încărcare", "value": "{{stops.loading.date}} {{stops.loading.time_window}}"},
            {"label": "Referință Încărcare", "value": "{{stops.loading.reference}}"},
            {"label": "Punct Descărcare", "value": "{{stops.unloading.address}}"},
            {"label": "Data Descărcare", "value": "{{stops.unloading.date}} {{stops.unloading.time_window}}"},
            {"label": "Referință Descărcare", "value": "{{stops.unloading.reference}}"},
            {"label": "Distanță", "value": "{{order.distance_km}} km"},
            {"label": "Timp Tranzit", "value": "{{order.transit_time}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "cargo-details",
        "type": "section",
        "content": {
          "title": "DETALII MARFĂ",
          "fields": [
            {"label": "Tip Marfă", "value": "{{cargo.type}}"},
            {"label": "Descriere", "value": "{{cargo.description}}"},
            {"label": "Greutate", "value": "{{cargo.weight}} kg"},
            {"label": "Dimensiuni", "value": "{{cargo.dimensions}}"},
            {"label": "Metri Liniari", "value": "{{cargo.loading_meters}} ML"},
            {"label": "Colete", "value": "{{cargo.packages}}"},
            {"label": "ADR/Periculos", "value": "{{cargo.adr_class}}"},
            {"label": "Temperatură", "value": "{{cargo.temperature_requirements}}"},
            {"label": "Instrucțiuni Speciale", "value": "{{cargo.special_instructions}}"}
          ]
        },
        "style": {
          "backgroundColor": "#f8fafc",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "15px"
        }
      },
      {
        "id": "financial",
        "type": "section",
        "content": {
          "title": "CONDIȚII FINANCIARE",
          "fields": [
            {"label": "Preț Convenit", "value": "{{order.carrier_price}} {{order.carrier_currency}}"},
            {"label": "Termen Plată", "value": "{{order.payment_days}} zile de la data facturii"},
            {"label": "Documente Necesare", "value": "CMR original, avize de livrare, POD"}
          ]
        },
        "style": {
          "backgroundColor": "#fef3c7",
          "border": "1px solid #f59e0b",
          "borderRadius": "4px",
          "padding": "15px",
          "marginBottom": "20px"
        }
      },
      {
        "id": "terms",
        "type": "text",
        "content": {
          "title": "CONDIȚII GENERALE",
          "text": "1. TERMEN DE PLATĂ\nTermenul de plată este de {{order.payment_days}} zile de la data primirii facturii în original, a scrisorilor de transport (CMR) confirmate fără rezerve, avizului de însoțire a mărfii și a altor documente de transport în original.\n\n2. FACTURARE\nFactura va fi emisă în {{order.carrier_currency}}, cu specificarea în subsidiar și a sumei în lei, la data expedierii prin poștă a facturii și a documentelor de transport; plata se va face în lei, la cursul BNR din ziua efectuării plății.\n\n**FACTURA VA PURTA OBLIGATORIU MENȚIUNEA PRIVIND NUMĂRUL DE COMANDĂ.**\n\nTariful convenit cuprinde toate cheltuielile aferente transportului (autorizații, taxe de drum, carnet TIR, CMR, asigurare CMR, întocmire carnet TIR, etc.).\n\n3. LITIGII\nÎn cazul în care apare un eveniment de transport, beneficiarul își rezervă dreptul de a nu achita contravaloarea transportului efectuat, până la soluționarea definitivă a acestuia.\n\n4. DOCUMENTE NECESARE\nTransportatorul va preda beneficiarului următoarele documente: factură în original, 2 CMR în original cu ștampila de la fiecare descărcare, note de livrare semnate și ștampilate de bună-primire, fără rezerve în original, declarație vamală de export, dacă este cazul. În cazul în care aceste documente nu sunt predate în termen de maximum 30 zile de la data efectuării transportului, se va reține 50% din valoarea transportului la care se adaugă daunele imputate de beneficiarul transportului.\n\n5. RĂSPUNDEREA TRANSPORTATORULUI\nTransportatorul este răspunzător de pierderea totală sau parțială a mărfii transportate și de avarierea acesteia, produsă între momentul primirii mărfii și cel al descărcării, cât și pentru întârzieri la livrare, indiferent de cauză. Transportatorul nu poate fi exonerat de răspundere nici pentru defectarea vehiculului folosit.\n\nÎn cazul în care există obiecțiuni cu privire la starea mărfurilor sau numărul coletelor, Transportatorul va face mențiune în CMR. Dacă nu au fost consemnate obiecțiuni în CMR se consideră că marfa a fost preluată corespunzător actelor de transport, atât calitativ cât și cantitativ.\n\n6. ASIGURARE\nTransportatorul are obligația să asigure marfa transportată prin încheierea asigurării CMR pentru valoarea minimă de 100.000 Euro.\n\n7. CONTROL TEMPERATURĂ\nPentru transporturile cu temperatură controlată, transportatorul trebuie să mențină temperatura cerută pe tot parcursul călătoriei și să furnizeze înregistrările de temperatură la livrare.\n\n8. CONFORMITATE\nTransportatorul confirmă conformitatea cu toate reglementările de transport aplicabile, inclusiv restricțiile privind timpul de conducere, starea tehnică a vehiculului și licențele corespunzătoare.\n\n9. CONFIDENȚIALITATE\nToate informațiile legate de această comandă de transport vor fi tratate ca confidențiale și nu vor fi divulgate terților fără acordul scris prealabil.\n\n10. LEGEA APLICABILĂ\nAcest acord va fi guvernat de Convenția CMR și de legislația națională de transport aplicabilă."
        },
        "style": {
          "fontSize": "9px",
          "lineHeight": "1.5",
          "textAlign": "justify",
          "padding": "15px",
          "backgroundColor": "#ffffff",
          "border": "1px solid #e2e8f0",
          "borderRadius": "4px",
          "marginBottom": "20px",
          "whiteSpace": "pre-wrap"
        }
      },
      {
        "id": "signatures",
        "type": "signatures",
        "content": {
          "columns": [
            {
              "title": "BENEFICIAR",
              "companyName": "{{company.name}}",
              "signatureLine": true,
              "dateLine": true,
              "stampPlaceholder": true
            },
            {
              "title": "TRANSPORTATOR",
              "companyName": "{{carrier.name}}",
              "signatureLine": true,
              "dateLine": true,
              "stampPlaceholder": true
            }
          ]
        },
        "style": {
          "marginTop": "30px",
          "paddingTop": "20px"
        }
      },
      {
        "id": "footer",
        "type": "footer",
        "content": {
          "text": "Acest document a fost generat automat. Comandă: {{order.reference_number}} | Pagina {{page}} din {{pages}}"
        },
        "style": {
          "fontSize": "8px",
          "color": "#6b7280",
          "textAlign": "center",
          "borderTop": "1px solid #e2e8f0",
          "paddingTop": "10px"
        }
      }
    ]
  }'::jsonb as html_template,
  false as is_default,
  NOW() as created_at,
  NOW() as updated_at
FROM admins a
WHERE a.status = 'active';

-- Show created templates
SELECT name, description, admin_id FROM order_templates WHERE name IN ('Carrier Order (EN)', 'Comandă de Transport (RO)') ORDER BY name;
