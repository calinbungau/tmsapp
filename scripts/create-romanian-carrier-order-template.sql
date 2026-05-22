-- Romanian Carrier Order Template (Comandă de Transport)
-- Based on standard Romanian transport order format

-- This template creates a professional Romanian carrier order document
-- with company header, order details, route info, cargo, terms & conditions

DO $$
DECLARE
    admin_record RECORD;
    template_config JSONB;
BEGIN
    -- Define the template configuration
    template_config := '{
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
                    "alignment": "right"
                }
            },
            {
                "id": "ro2",
                "type": "custom_text",
                "visible": true,
                "props": {
                    "title": "",
                    "text": "COMANDĂ DE TRANSPORT NR. {{reference_number}} / {{order_date}}",
                    "fontSize": 14,
                    "bold": true,
                    "alignment": "center"
                }
            },
            {
                "id": "ro3",
                "type": "divider",
                "visible": true,
                "props": {
                    "style": "solid",
                    "color": "#374151",
                    "thickness": 2
                }
            },
            {
                "id": "ro4",
                "type": "carrier_info",
                "visible": true,
                "props": {
                    "showContact": true,
                    "showPaymentTerms": false,
                    "showVat": true,
                    "title": "Către:",
                    "layout": "compact"
                }
            },
            {
                "id": "ro5",
                "type": "route_summary",
                "visible": true,
                "props": {
                    "showDistance": false,
                    "showDuration": false,
                    "showFlags": true,
                    "title": "Ruta:",
                    "format": "compact"
                }
            },
            {
                "id": "ro6",
                "type": "custom_text",
                "visible": true,
                "props": {
                    "title": "",
                    "text": "Nr. camion: {{vehicle_plate}}",
                    "fontSize": 10,
                    "bold": false,
                    "alignment": "left"
                }
            },
            {
                "id": "ro7",
                "type": "stops_table",
                "visible": true,
                "props": {
                    "showTimeWindow": true,
                    "showAddress": true,
                    "showContact": false,
                    "showNotes": true,
                    "rowsPerPage": 6,
                    "title": "Puncte încărcare/descărcare:",
                    "pickupLabel": "Locul/data încărcării",
                    "deliveryLabel": "Locul/data descărcării",
                    "format": "romanian"
                }
            },
            {
                "id": "ro8",
                "type": "cargo_details",
                "visible": true,
                "props": {
                    "showWeight": true,
                    "showPallets": true,
                    "showVolume": false,
                    "showAdr": false,
                    "showTemperature": true,
                    "showGoodsType": true,
                    "layout": "inline",
                    "temperatureLabel": "Temperatura",
                    "goodsLabel": "Natura marfii",
                    "weightLabel": "Cantitate"
                }
            },
            {
                "id": "ro9",
                "type": "notes",
                "visible": true,
                "props": {
                    "title": "Detalii:",
                    "showInternalNotes": false,
                    "showSpecialInstructions": true
                }
            },
            {
                "id": "ro10",
                "type": "financial_summary",
                "visible": true,
                "props": {
                    "showCustomerPrice": false,
                    "showCarrierCost": true,
                    "showMargin": false,
                    "showCurrency": true,
                    "showPaymentTerms": false,
                    "title": "Tarif:",
                    "format": "simple",
                    "vatNote": "+ TVA"
                }
            },
            {
                "id": "ro11",
                "type": "divider",
                "visible": true,
                "props": {
                    "style": "solid",
                    "color": "#e5e7eb",
                    "thickness": 1
                }
            },
            {
                "id": "ro12",
                "type": "terms",
                "visible": true,
                "props": {
                    "title": "CONDIȚII GENERALE:",
                    "text": "1. Termenul de plată este de {{payment_terms_carrier_days}} de zile de la data primirii facturii în original, a scrisorilor de transport (CMR) confirmate fără rezerve, avizului de însoțire a mărfii și a altor documente de transport în original.\n\n2. Factura va fi emisă în Euro, cu specificarea în subsidiar și a sumei în lei, la data expedierii prin poștă a facturii și a documentelor de transport; plata se va face în lei, la cursul BNR din ziua efectuării plății. FACTURA VA PURTA OBLIGATORIU MENȚIUNEA PRIVIND NUMĂRUL DE COMANDĂ. Tariful convenit cuprinde toate cheltuielile aferente transportului (autorizații, taxe de drum, carnet TIR, CMR, asigurare CMR, etc).\n\n3. În cazul în care apare un eveniment de transport, beneficiarul își rezervă dreptul de a nu achita contravaloarea transportului efectuat, până la soluționarea definitivă a acestuia.\n\n4. Transportatorul va preda beneficiarului următoarele documente: factura în original, 2 CMR în original cu ștampila de la fiecare descărcare, note de livrare semnate și ștampilate de bună-primire, fără rezerve în original, declarație vamală de export, dacă este cazul. În cazul în care aceste documente nu sunt predate în termen de maximum 30 zile de la data efectuării transportului, se va reține 50% din valoarea transportului.\n\n5. Transportatorul este răspunzător de pierderea totală sau parțială a mărfii transportate și de avarierea acesteia, produsă între momentul primirii mărfii și cel al descărcării, cât și pentru întârzieri la livrare, indiferent de cauză.\n\n6. Transportatorul are obligația să asigure marfa transportată prin încheierea asigurării CMR pentru valoarea minimă de 100.000 Euro.\n\n7. Transportatorul declară că deține Poliță de asigurare CMR valabilă pe toată durata efectuării transportului.\n\n8. Transportatorul răspunde de respectarea condițiilor tehnice de încărcare și fixare a bunurilor în mijlocul de transport.\n\n9. Transportatorul preia marfa de la adresa de încărcare și o va preda la locul de descărcare la data stabilită. În caz de întârziere, transportatorul se obligă să achite despăgubiri în cuantum de 200 Euro pentru fiecare zi de întârziere.\n\n10. Transportatorul va comunica, în termen de 10 ore, orice eveniment de transport care apare pe durata efectuării transportului.\n\n11. Transportatorul va verifica încărcătura și se va asigura că transportul nu depășește sarcina maxim admisă.\n\n12. Transportatorul se obligă să nu contacteze direct clientul Beneficiarului timp de 2 ani de la efectuarea transportului.\n\n13. Camionul este într-o stare tehnică bună.\n\n14. Este interzisă orice manipulare a mărfii fără acordul nostru.\n\n15. Pe parcursul transportului staționarea se va face exclusiv în parcări amenajate și păzite.\n\n16. Transportatorul se obligă să nu pună încărcătură suplimentară fără a obține în prealabil acordul nostru.\n\n17. Orice litigii nesoluționate pe cale amiabilă vor fi de competența instanțelor judecătorești de la sediul nostru.\n\n18. Timp liber la încărcare 24 ore, respectiv la descărcare 48 ore. După această perioadă se vor accepta costuri de staționare de maxim 100 Euro/Zi lucrătoare.",
                    "fontSize": 7
                }
            },
            {
                "id": "ro13",
                "type": "custom_text",
                "visible": true,
                "props": {
                    "title": "",
                    "text": "ÎN LIPSA REFUZULUI ACESTEI COMENZI ÎN TIMP DE 30 DE MINUTE DE LA TRANSMITEREA EI, COMANDA SE CONSIDERĂ ACCEPTATĂ CU TOATE CONDIȚIILE.",
                    "fontSize": 8,
                    "bold": true,
                    "alignment": "center"
                }
            },
            {
                "id": "ro14",
                "type": "custom_text",
                "visible": true,
                "props": {
                    "title": "",
                    "text": "Prevederile prezentei Convenții se completează cu Convenția CMR, Convenția TIR, precum și celelalte convenții și reglementări naționale și internaționale aplicabile.",
                    "fontSize": 8,
                    "bold": false,
                    "alignment": "left"
                }
            },
            {
                "id": "ro15",
                "type": "divider",
                "visible": true,
                "props": {
                    "style": "solid",
                    "color": "#e5e7eb",
                    "thickness": 1
                }
            },
            {
                "id": "ro16",
                "type": "signature_area",
                "visible": true,
                "props": {
                    "leftLabel": "{{company_name}}",
                    "rightLabel": "{{carrier_name}}",
                    "showDate": false,
                    "showStamp": true
                }
            },
            {
                "id": "ro17",
                "type": "footer",
                "visible": true,
                "props": {
                    "showPageNumbers": true,
                    "showContact": true,
                    "customText": "Adresa de corespondență: {{company_address}}"
                }
            }
        ],
        "pageSettings": {
            "marginTop": 15,
            "marginBottom": 15,
            "marginLeft": 20,
            "marginRight": 20,
            "orientation": "portrait",
            "fontSize": 9,
            "primaryColor": "#1f2937"
        }
    }'::jsonb;

    -- Insert template for each admin that doesn't have a Romanian template yet
    FOR admin_record IN 
        SELECT id FROM admins WHERE is_active = true
    LOOP
        -- Check if admin already has a Romanian carrier order template
        IF NOT EXISTS (
            SELECT 1 FROM order_templates 
            WHERE admin_id = admin_record.id 
            AND name ILIKE '%Comandă de Transport%'
        ) THEN
            INSERT INTO order_templates (
                admin_id,
                template_type,
                name,
                html_template,
                is_default,
                is_active
            ) VALUES (
                admin_record.id,
                'carrier_order',
                'Comandă de Transport (RO)',
                template_config::text,
                false,
                true
            );
            RAISE NOTICE 'Created Romanian carrier order template for admin %', admin_record.id;
        ELSE
            RAISE NOTICE 'Admin % already has a Romanian template, skipping', admin_record.id;
        END IF;
    END LOOP;
END $$;

SELECT 
    id,
    admin_id,
    name,
    template_type,
    is_default,
    is_active
FROM order_templates 
WHERE name ILIKE '%Comandă%' OR name ILIKE '%Romanian%'
ORDER BY created_at DESC;
