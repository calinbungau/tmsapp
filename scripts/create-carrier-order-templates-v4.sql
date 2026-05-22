-- Create Carrier Order Templates (EN and RO) with correct JSON structure
-- Matches the TemplateConfig interface expected by the template builder

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
        "id": "en1",
        "type": "company_header",
        "visible": true,
        "props": {
          "showLogo": true,
          "showAddress": true,
          "showVat": true,
          "showPhone": true,
          "showEmail": true,
          "alignment": "left"
        }
      },
      {
        "id": "en2",
        "type": "divider",
        "visible": true,
        "props": {
          "style": "solid",
          "color": "#1e40af",
          "thickness": 2
        }
      },
      {
        "id": "en3",
        "type": "order_info",
        "visible": true,
        "props": {
          "showDate": true,
          "showStatus": true,
          "showType": true,
          "layout": "horizontal"
        }
      },
      {
        "id": "en4",
        "type": "carrier_info",
        "visible": true,
        "props": {
          "showContact": true,
          "showPaymentTerms": true,
          "showVat": true
        }
      },
      {
        "id": "en5",
        "type": "route_summary",
        "visible": true,
        "props": {
          "showDistance": true,
          "showDuration": true,
          "showFlags": true
        }
      },
      {
        "id": "en6",
        "type": "stops_table",
        "visible": true,
        "props": {
          "showTimeWindow": true,
          "showAddress": true,
          "showContact": true,
          "showNotes": false,
          "rowsPerPage": 10
        }
      },
      {
        "id": "en7",
        "type": "cargo_details",
        "visible": true,
        "props": {
          "showWeight": true,
          "showPallets": true,
          "showVolume": true,
          "showAdr": true,
          "showTemperature": true,
          "showGoodsType": true
        }
      },
      {
        "id": "en8",
        "type": "financial_summary",
        "visible": true,
        "props": {
          "showCustomerPrice": false,
          "showCarrierCost": true,
          "showMargin": false,
          "showCurrency": true,
          "showPaymentTerms": true
        }
      },
      {
        "id": "en9",
        "type": "divider",
        "visible": true,
        "props": {
          "style": "solid",
          "color": "#e5e7eb",
          "thickness": 1
        }
      },
      {
        "id": "en10",
        "type": "terms",
        "visible": true,
        "props": {
          "title": "GENERAL TERMS AND CONDITIONS",
          "text": "1. PAYMENT TERMS\nPayment is due within 45 days from the date of receipt of the invoice in original, along with the CMR consignment notes confirmed without reservations, delivery notes stamped and signed as proof of delivery, and any customs documents if applicable.\n\n2. INVOICING\nThe invoice shall be issued in EUR, with the equivalent amount in local currency if required. The mailing date of transport documents shall apply. Payment shall be made at the exchange rate of the National Bank on the day of payment.\n\nTHE INVOICE MUST CONTAIN THE ORDER NUMBER.\n\nThe agreed rate includes all costs related to the transport (permits, road taxes, TIR carnet, CMR insurance, etc.).\n\n3. TRANSPORT EVENTS\nIn the event of any transport incident, the Principal reserves the right not to pay the transport value until the final resolution of the matter.\n\n4. REQUIRED DOCUMENTS\nThe Carrier shall provide: invoice in original, 2 CMR in original with stamps from each unloading, delivery notes stamped and signed. If documents are not delivered within 30 days, 50% of transport value shall be withheld.\n\n5. LIABILITY\nThe Carrier is responsible for total or partial loss or damage to transported goods, as well as for delays in delivery. The Carrier cannot be exempted from liability for vehicle defects.\n\n6. CMR INSURANCE\nThe Carrier is obligated to insure the transported goods by concluding CMR insurance for a minimum value of EUR 100,000.",
          "fontSize": 8
        }
      },
      {
        "id": "en11",
        "type": "signature_area",
        "visible": true,
        "props": {
          "leftLabel": "For the Principal",
          "rightLabel": "For the Carrier",
          "showDate": true,
          "showStamp": true
        }
      },
      {
        "id": "en12",
        "type": "footer",
        "visible": true,
        "props": {
          "showPageNumbers": true,
          "showContact": true,
          "customText": ""
        }
      }
    ],
    "pageSettings": {
      "marginTop": 20,
      "marginBottom": 20,
      "marginLeft": 20,
      "marginRight": 20,
      "orientation": "portrait",
      "fontSize": 10,
      "primaryColor": "#1e40af"
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
        "id": "ro1",
        "type": "company_header",
        "visible": true,
        "props": {
          "showLogo": true,
          "showAddress": true,
          "showVat": true,
          "showPhone": true,
          "showEmail": true,
          "alignment": "left"
        }
      },
      {
        "id": "ro2",
        "type": "divider",
        "visible": true,
        "props": {
          "style": "solid",
          "color": "#1e40af",
          "thickness": 2
        }
      },
      {
        "id": "ro3",
        "type": "order_info",
        "visible": true,
        "props": {
          "showDate": true,
          "showStatus": true,
          "showType": true,
          "layout": "horizontal"
        }
      },
      {
        "id": "ro4",
        "type": "carrier_info",
        "visible": true,
        "props": {
          "showContact": true,
          "showPaymentTerms": true,
          "showVat": true
        }
      },
      {
        "id": "ro5",
        "type": "route_summary",
        "visible": true,
        "props": {
          "showDistance": true,
          "showDuration": true,
          "showFlags": true
        }
      },
      {
        "id": "ro6",
        "type": "stops_table",
        "visible": true,
        "props": {
          "showTimeWindow": true,
          "showAddress": true,
          "showContact": true,
          "showNotes": false,
          "rowsPerPage": 10
        }
      },
      {
        "id": "ro7",
        "type": "cargo_details",
        "visible": true,
        "props": {
          "showWeight": true,
          "showPallets": true,
          "showVolume": true,
          "showAdr": true,
          "showTemperature": true,
          "showGoodsType": true
        }
      },
      {
        "id": "ro8",
        "type": "financial_summary",
        "visible": true,
        "props": {
          "showCustomerPrice": false,
          "showCarrierCost": true,
          "showMargin": false,
          "showCurrency": true,
          "showPaymentTerms": true
        }
      },
      {
        "id": "ro9",
        "type": "divider",
        "visible": true,
        "props": {
          "style": "solid",
          "color": "#e5e7eb",
          "thickness": 1
        }
      },
      {
        "id": "ro10",
        "type": "terms",
        "visible": true,
        "props": {
          "title": "CONDIȚII GENERALE",
          "text": "1. TERMENUL DE PLATĂ\nTermenul de plată este de 45 de zile de la data primirii facturii în original, a scrisorilor de transport (CMR) confirmate fără rezerve, avizului de însoțire a mărfii și a altor documente de transport în original.\n\n2. FACTURAREA\nFactura va fi emisă în Euro, cu specificarea în subsidiar și a sumei în lei, la data expedierii prin poștă a facturii și a documentelor de transport; plata se va face în lei, la cursul BNR din ziua efectuării plății.\n\nFACTURA VA PURTA OBLIGATORIU MENȚIUNEA PRIVIND NUMĂRUL DE COMANDĂ.\n\nTariful convenit cuprinde toate cheltuielile aferente transportului (autorizații, taxe de drum, carnet TIR, CMR, asigurare CMR, întocmire carnet TIR, etc).\n\n3. EVENIMENTE DE TRANSPORT\nÎn cazul în care apare un eveniment de transport, beneficiarul își rezervă dreptul de a nu achita contravaloarea transportului efectuat, până la soluționarea definitivă a acestuia.\n\n4. DOCUMENTE NECESARE\nTransportatorul va preda beneficiarului următoarele documente: factură în original, 2 CMR în original cu ștampila de la fiecare descărcare, note de livrare semnate și ștampilate de bună-primire, fără rezerve în original. În cazul în care aceste documente nu sunt predate în termen de maximum 30 zile de la data efectuării transportului, se va reține 50% din valoarea transportului.\n\n5. RĂSPUNDERE\nTransportatorul este răspunzător de pierderea totală sau parțială a mărfii transportate și de avarierea acesteia, produsă între momentul primirii mărfii și cel al descărcării, cât și pentru întârzieri la livrare, indiferent de cauză. Transportatorul nu poate fi exonerat de răspundere nici pentru defectarea vehiculului folosit.\n\n6. ASIGURARE CMR\nTransportatorul are obligația să asigure marfa transportată prin încheierea asigurării CMR pentru valoarea minimă de 100.000 Euro.",
          "fontSize": 8
        }
      },
      {
        "id": "ro11",
        "type": "signature_area",
        "visible": true,
        "props": {
          "leftLabel": "Pentru Beneficiar",
          "rightLabel": "Pentru Transportator",
          "showDate": true,
          "showStamp": true
        }
      },
      {
        "id": "ro12",
        "type": "footer",
        "visible": true,
        "props": {
          "showPageNumbers": true,
          "showContact": true,
          "customText": ""
        }
      }
    ],
    "pageSettings": {
      "marginTop": 20,
      "marginBottom": 20,
      "marginLeft": 20,
      "marginRight": 20,
      "orientation": "portrait",
      "fontSize": 10,
      "primaryColor": "#1e40af"
    }
  }'::text as html_template
FROM admins
WHERE is_active = true;
