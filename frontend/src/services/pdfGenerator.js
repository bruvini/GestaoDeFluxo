import { differenceInDays } from 'date-fns';

const SETORES_URGENCIA = ['PS DECISÃO CIRURGICA', 'PS DECISÃO CLINICA', 'SALA DE EMERGENCIA', 'SALA LARANJA'];

const parseDate = (dateInput) => {
    if (!dateInput) return new Date();
    if (dateInput?.toDate) return dateInput.toDate();
    if (dateInput instanceof Date) return dateInput;
    const dateStr = String(dateInput).replace(',', '');
    const ptBrRegex = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/;
    const match = dateStr.match(ptBrRegex);
    if (match) {
        const [, day, month, year, hour = 0, minute = 0, second = 0] = match;
        return new Date(year, month - 1, day, hour, minute, second);
    }
    const fallback = new Date(dateInput);
    return isNaN(fallback.getTime()) ? new Date() : fallback;
};

export const generatePdfReport = (pacientes) => {
    // 1. Filtra pacientes ativos dos setores corretos
    const urgenciaPacientes = pacientes.filter(p => {
        const status = p.status?.toUpperCase();
        const setor = p.setor?.toUpperCase();
        return (status === 'ATIVO' || status === 'SINALIZADA') && SETORES_URGENCIA.includes(setor);
    });

    // 2. Remove duplicidades de leito mantendo prioridade (SINALIZADA vence)
    const mapaLeitos = new Map();
    urgenciaPacientes.forEach(p => {
        const leito = p.leito?.trim() || 'N/A';
        const status = p.status?.toUpperCase();
        if (!mapaLeitos.has(leito)) {
            mapaLeitos.set(leito, p);
        } else {
            const existente = mapaLeitos.get(leito);
            if (status === 'SINALIZADA' && existente.status?.toUpperCase() === 'ATIVO') {
                mapaLeitos.set(leito, p);
            }
        }
    });

    const listaFinal = Array.from(mapaLeitos.values());

    // 3. Ordenação Alfanumérica
    listaFinal.sort((a, b) => String(a.leito).localeCompare(String(b.leito), undefined, { numeric: true, sensitivity: 'base' }));

    // 4. Agrupar por Setor
    const agrupados = {};
    listaFinal.forEach(p => {
        const setor = p.setor?.toUpperCase() || 'NÃO INFORMADO';
        if (!agrupados[setor]) agrupados[setor] = [];
        agrupados[setor].push(p);
    });

    // 5. Montar HTML Premium para Impressão
    const hoje = new Date();
    let html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório de Rondas - NIR</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        @page { size: A4 portrait; margin: 10mm; }
        body { font-family: 'Inter', sans-serif; font-size: 10px; color: #0f172a; margin: 0; padding: 0; background: #fff; }
        .header { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 15px; }
        .header h1 { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
        .header p { margin: 4px 0 0; font-size: 10px; color: #64748b; font-weight: 600; }
        .instructions { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 15px; text-align: justify; line-height: 1.5; font-size: 9px; color: #334155; }
        .sector-title { background: #1e293b; color: #fff; padding: 6px 10px; font-size: 12px; font-weight: 700; border-radius: 4px 4px 0 0; margin-top: 15px; margin-bottom: 0; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 6px; vertical-align: top; }
        th { background-color: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #475569; text-align: left; }
        .center { text-align: center; }
        .leito-badge { background: #e2e8f0; border: 1px solid #94a3b8; padding: 2px 4px; border-radius: 4px; font-weight: 900; font-size: 11px; }
        .patient-name { font-weight: 700; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
        .obs-box { min-height: 35px; color: #334155; font-size: 9px; line-height: 1.4; }
        .sisreg-badge { display: inline-block; border: 1px dashed #64748b; background: #f8fafc; padding: 2px 4px; font-weight: 700; border-radius: 3px; margin-bottom: 4px; font-size: 8px; }
        .note-text { font-style: italic; color: #475569; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Relatório de Rondas - Urgência e Emergência</h1>
        <p>GERADO EM: ${hoje.toLocaleDateString('pt-BR')} ÀS ${hoje.toLocaleTimeString('pt-BR')}</p>
      </div>
      <div class="instructions">
        <strong>⚠️ INSTRUÇÃO OPERACIONAL:</strong> Utilize este formulário impresso durante as rondas médicas/enfermagem. A coluna "OBSERVAÇÕES" possui espaço reservado para anotações a caneta. <strong>MANDATÓRIO:</strong> Após a ronda, todas as anotações físicas devem ser transcritas imediatamente para o painel digital do Sistema NIR.
      </div>
  `;

    const setoresOrdenados = Object.keys(agrupados).sort();

    if (setoresOrdenados.length === 0) {
        html += `<p class="center" style="margin-top: 50px; font-style: italic; color: #64748b;">Nenhum paciente ativo localizado nos setores de urgência.</p>`;
    } else {
        for (const setor of setoresOrdenados) {
            html += `<div class="sector-title">📍 ${setor} (Total: ${agrupados[setor].length})</div>`;
            html += `
        <table>
          <thead>
            <tr>
              <th style="width: 8%; text-align: center;">LEITO</th>
              <th style="width: 32%;">PACIENTE</th>
              <th style="width: 5%; text-align: center;">SEXO</th>
              <th style="width: 10%; text-align: center;">DIAS INT.</th>
              <th style="width: 45%;">OBSERVAÇÕES (Histórico Prévio e Anotação a Caneta)</th>
            </tr>
          </thead>
          <tbody>
      `;

            agrupados[setor].forEach(p => {
                const dias = differenceInDays(hoje, parseDate(p.admission || p.dataInternacao));

                let obsHTML = '';
                if (p.numeroSisreg) {
                    obsHTML += `<div class="sisreg-badge">SISREG: ${p.numeroSisreg}</div><br>`;
                }

                if (p.historico && p.historico.length > 0) {
                    let ultimaNota = p.historico[0];
                    let texto = ultimaNota.texto;
                    if (texto.length > 120) texto = texto.substring(0, 120) + '...';
                    const dataNota = new Date(ultimaNota.data).toLocaleDateString('pt-BR');
                    obsHTML += `<span class="note-text"><b>Nota (${dataNota}):</b> ${texto}</span>`;
                }

                html += `
          <tr>
            <td class="center"><span class="leito-badge">${p.leito || 'N/A'}</span></td>
            <td>
              <div class="patient-name">${p.nome}</div>
              <div style="font-size: 8px; color: #64748b;">Nasc: ${p.nascimento}</div>
            </td>
            <td class="center">${p.sexo}</td>
            <td class="center" style="font-weight: 700; font-size: 11px;">${dias}</td>
            <td><div class="obs-box">${obsHTML}</div></td>
          </tr>
        `;
            });

            html += `</tbody></table>`;
        }
    }

    html += `</body></html>`;

    // 6. Abrir janela e imprimir
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Aguarda o render do CSS antes de chamar o print
        printWindow.setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            // Opcional: printWindow.close() apos a impressão
        }, 250);
    } else {
        alert('Por favor, permita pop-ups para gerar o relatório.');
    }
};
