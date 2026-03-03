import React, { useState, useEffect, useRef, useMemo } from 'react';
import { differenceInHours, differenceInDays } from 'date-fns';
import {
  Activity, Printer, Upload, RefreshCw, Search,
  MapPin, Clock, Calendar, AlertTriangle, FileText,
  User, Hash, FileSpreadsheet, X, Send, Edit2
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { db } from './config/firebase';
import { processExcelUpload } from './services/syncEngine';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';

const parseDate = (dateInput) => {
  if (!dateInput) return new Date();
  if (dateInput?.toDate) return dateInput.toDate();
  if (dateInput instanceof Date) return dateInput;

  const dateStr = String(dateInput);
  const ptBrRegex = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/;
  const match = dateStr.match(ptBrRegex);

  if (match) {
    const [, day, month, year, hour = 0, minute = 0] = match;
    return new Date(year, month - 1, day, hour, minute);
  }

  const fallback = new Date(dateInput);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
};

const calculateTimeElapsed = (admissionDate) => {
  const parsedDate = parseDate(admissionDate);
  const now = new Date();
  const hours = differenceInHours(now, parsedDate);
  const days = differenceInDays(now, parsedDate);

  if (hours < 24) {
    return `${hours} horas`;
  }

  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} dia(s) e ${remainingHours} hora(s)` : `${days} dia(s)`;
};

const getStatusColor = (admissionDate) => {
  const parsedDate = parseDate(admissionDate);
  const days = differenceInDays(new Date(), parsedDate);
  const hours = differenceInHours(new Date(), parsedDate);

  if (hours < 48) return 'border-emerald-500';
  if (hours < 72) return 'border-amber-500';
  if (days < 7) return 'border-orange-500';
  if (days < 15) return 'border-red-500';
  if (days < 30) return 'border-purple-500';
  return 'border-slate-800';
};

const SETORES_URGENCIA = [
  "PS DECISÃO CIRURGICA",
  "PS DECISÃO CLINICA",
  "SALA DE EMERGENCIA",
  "SALA LARANJA"
];

function App() {
  const [pacientes, setPacientes] = useState([]);

  // Filtros de Estado
  const [busca, setBusca] = useState('');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroSisreg, setFiltroSisreg] = useState(false);
  const [filtroNotas, setFiltroNotas] = useState(false);

  // States do Slide-over Notas
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activePatient, setActivePatient] = useState(null);
  const [editingNoteIndex, setEditingNoteIndex] = useState(null);
  const [noteText, setNoteText] = useState('');

  const [currentTime, setCurrentTime] = useState(new Date());
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'gestaoFluxo_pacientes'),
      where('status', 'in', ['ATIVO', 'SINALIZADA'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pacs = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const admissionDate = data.dataInternacao ? new Date(data.dataInternacao) : new Date();
        pacs.push({
          id: doc.id,
          ...data,
          admission: admissionDate,
          statusColor: getStatusColor(admissionDate)
        });
      });
      // Ordena por data de internação (mais antigos primeiro)
      pacs.sort((a, b) => a.admission - b.admission);
      setPacientes(pacs);
    });

    return () => unsubscribe();
  }, []);

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({
      title: 'Processando Relatório...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const rows = jsonData.slice(3);

        const formatExcelDate = (val) => val instanceof Date ? val.toLocaleDateString('pt-BR') : String(val || '');

        const dadosTratados = rows
          .filter(row => row[0])
          .map(row => ({
            nome: String(row[0] || '').trim(),
            nascimento: formatExcelDate(row[1]),
            sexo: String(row[2] || ''),
            dataInternacao: row[3] instanceof Date ? row[3].toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : String(row[3] || ''),
            setor: String(row[4] || '').trim(),
            leito: String(row[6] || '').trim(), // Pulando F (5), Leito vai pra G (6)
            especialidade: String(row[7] || '').trim() // Pulando F (5), Espec vai pra H (7)
          }));

        const resultado = await processExcelUpload(dadosTratados, db);
        Swal.fire(
          'Censo Atualizado!',
          `Novos: ${resultado.inseridos}\nAtualizados: ${resultado.atualizados}\nAltas: ${resultado.altas}`,
          'success'
        );
      } catch (error) {
        console.error(error);
        Swal.fire('Erro', 'Falha na importacao', 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      Swal.fire('Erro', 'Falha ao ler o arquivo', 'error');
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const abrirModalSisreg = async (patient) => {
    const { value: formValues } = await Swal.fire({
      title: `SISREG - ${patient.nome}`,
      html: `
        <input id="swal-data" type="date" class="swal2-input" placeholder="Data da Solicitação">
        <input id="swal-numero" type="number" class="swal2-input" placeholder="Número do SISREG">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Salvar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const data = document.getElementById('swal-data').value;
        const num = document.getElementById('swal-numero').value;
        if (!data || !num) {
          Swal.showValidationMessage('Preencha os dois campos!');
        }
        return { data, num };
      }
    });

    if (formValues) {
      try {
        await updateDoc(doc(db, 'gestaoFluxo_pacientes', patient.id), {
          numeroSisreg: formValues.num,
          dataSisreg: formValues.data,
        });
        Swal.fire('Salvo!', 'SISREG vinculado com sucesso.', 'success');
      } catch (e) {
        Swal.fire('Erro', 'Falha ao salvar SISREG', 'error');
      }
    }
  };

  const openNotesPanel = (patient) => {
    setActivePatient(patient);
    setNoteText('');
    setEditingNoteIndex(null);
    setIsNotesOpen(true);
  };

  const saveNote = async () => {
    if (!noteText.trim() || !activePatient) return;
    try {
      const historicoAtual = [...(activePatient.historico || [])];

      if (editingNoteIndex !== null) {
        // Edição de nota existente
        historicoAtual[editingNoteIndex].texto = noteText;
        historicoAtual[editingNoteIndex].dataEdicao = new Date().toISOString();
      } else {
        // Nova nota no topo
        historicoAtual.unshift({
          data: new Date().toISOString(),
          usuario: 'Enfermagem/NIR',
          texto: noteText
        });
      }

      await updateDoc(doc(db, 'gestaoFluxo_pacientes', activePatient.id), {
        historico: historicoAtual
      });

      setNoteText('');
      setEditingNoteIndex(null);
      // O activePatient será atualizado via Firestore real-time onSnapshot
    } catch (e) {
      console.error(e);
      Swal.fire('Erro', 'Falha ao salvar nota', 'error');
    }
  };

  // Lista dinâmica de setores únicos recebidos do banco para o select
  const setoresUnicos = useMemo(() => {
    const setores = pacientes.map(p => p.setor).filter(Boolean);
    return [...new Set(setores)].sort();
  }, [pacientes]);

  // ENGINE DE FILTRAGEM (3 Fases)
  const motorFiltragem = useMemo(() => {
    // FASE 1: Filtro Base (Busca, Setor, Status, Datas)
    const fase1 = pacientes.filter(p => {
      // 1.1 Busca (Nome/Leito)
      if (busca) {
        const trm = busca.toLowerCase();
        const nMatch = p.nome?.toLowerCase().includes(trm);
        const lMatch = p.leito?.toLowerCase().includes(trm);
        if (!nMatch && !lMatch) return false;
      }

      // 1.2 Setor
      if (setorFiltro && p.setor !== setorFiltro) return false;

      // 1.3 Data (Internação)
      if (dataInicio || dataFim) {
        const adm = parseDate(p.admission);
        if (dataInicio && adm < new Date(dataInicio)) return false;
        if (dataFim) {
          const fim = new Date(dataFim);
          fim.setHours(23, 59, 59, 999);
          if (adm > fim) return false;
        }
      }

      // 1.4 Status (Regras Legado Baseadas em Tempo)
      if (statusFiltro) {
        const hours = differenceInHours(new Date(), parseDate(p.admission));
        const days = differenceInDays(new Date(), parseDate(p.admission));

        switch (statusFiltro) {
          case 'Verde': if (hours >= 48) return false; break;
          case 'Amarelo': if (hours < 48 || hours >= 72) return false; break;
          case 'Vermelho': if (hours < 72 || days >= 7) return false; break;
          case 'Laranja': if (days < 7 || days >= 15) return false; break;
          case 'Roxo': if (days < 15 || days >= 30) return false; break;
          case 'Preto': if (days < 30) return false; break;
          default: break;
        }
      }
      return true;
    });

    // FASE 2: Contadores Analíticos (Baseado na Fase 1)
    let countSemSisreg = 0;
    let countComNotas = 0;

    fase1.forEach(p => {
      // Regra legado: É Urgência e não tem SISREG preenchido
      const msisreg = SETORES_URGENCIA.some(s => p.setor?.toUpperCase().includes(s)) && !p.numeroSisreg;
      if (msisreg) countSemSisreg++;
      if (p.historico && p.historico.length > 0) countComNotas++;
    });

    // FASE 3: Filtro Final (Aplica os Toggles do Painel)
    const dadosFinais = fase1.filter(p => {
      if (filtroSisreg) {
        const msisreg = SETORES_URGENCIA.some(s => p.setor?.toUpperCase().includes(s)) && !p.numeroSisreg;
        if (!msisreg) return false;
      }
      if (filtroNotas && (!p.historico || p.historico.length === 0)) return false;
      return true;
    });

    return { filtrados: dadosFinais, countSemSisreg, countComNotas };
  }, [pacientes, busca, setorFiltro, statusFiltro, dataInicio, dataFim, filtroSisreg, filtroNotas]);

  // Agrupamento usando apenas a lista FILTRADA FINAL
  const groupedPatients = motorFiltragem.filtrados.reduce((acc, p) => {
    const sector = p.setor || 'NÃO INFORMADO';
    if (!acc[sector]) acc[sector] = [];
    acc[sector].push(p);
    return acc;
  }, {});

  // Contagem de KPIs lendo da lista FILTRADA FINAL
  const kpis = { verde: 0, amarelo: 0, vermelho: 0, laranja: 0, roxo: 0, preto: 0 };
  motorFiltragem.filtrados.forEach(p => {
    const parsed = parseDate(p.admission);
    const hours = differenceInHours(new Date(), parsed);
    const days = differenceInDays(new Date(), parsed);
    if (hours < 48) kpis.verde++;
    else if (hours < 72) kpis.amarelo++;
    else if (days < 7) kpis.vermelho++;
    else if (days < 15) kpis.laranja++;
    else if (days < 30) kpis.roxo++;
    else kpis.preto++;
  });

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-12">
      {/* NAVBAR */}
      <header className="bg-[#1e293b] text-white shadow-md flex items-center justify-between px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img
            src="/logo-joinville.png"
            alt="Logo Joinville"
            className="h-10 w-auto object-contain bg-white rounded p-1 shadow-sm"
          />
          <h1 className="text-xl font-bold tracking-wide">
            SISTEMA NIR 2.0
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm font-medium transition-colors">
              <Printer size={16} /> Imprimir SISREG
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-medium transition-colors shadow-sm"
            >
              <Upload size={16} /> Importar XLSX
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              className="hidden"
              accept=".xlsx, .xls, .csv"
            />
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm font-medium transition-colors">
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>

          <div className="text-right text-slate-300 font-medium whitespace-nowrap border-l border-slate-600 pl-4 ml-2">
            <div className="text-lg leading-tight">{formattedTime}</div>
            <div className="text-xs opacity-75">{formattedDate}</div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* KPI GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-emerald-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ATÉ 48 HORAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.verde}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-amber-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">48 A 72 HORAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.amarelo}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-orange-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">72H A 7 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.vermelho}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-red-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">7 A 15 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.laranja}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-purple-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">15 A 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.roxo}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-slate-800 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">MAIS DE 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.preto}</div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
            <div className="xl:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Buscar Paciente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, Leito..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Setor</label>
              <select
                value={setorFiltro}
                onChange={(e) => setSetorFiltro(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
              >
                <option value="">Todos os Setores</option>
                {setoresUnicos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
              >
                <option value="">Todos os Status</option>
                <option value="Verde">Até 48h</option>
                <option value="Amarelo">48 a 72h</option>
                <option value="Vermelho">72h a 7 dias</option>
                <option value="Laranja">7 a 15 dias</option>
                <option value="Roxo">15 a 30 dias</option>
                <option value="Preto">Mais de 30 dias</option>
              </select>
            </div>

            <div className="flex gap-2 xl:col-span-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Internação De:</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Até:</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="flex gap-4 xl:col-span-6 mt-4 xl:mt-0 xl:justify-end pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={filtroSisreg}
                    onChange={(e) => setFiltroSisreg(e.target.checked)}
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Sem SISREG ({motorFiltragem.countSemSisreg})</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={filtroNotas}
                    onChange={(e) => setFiltroNotas(e.target.checked)}
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Com Notas ({motorFiltragem.countComNotas})</span>
              </label>
            </div>
          </div>
        </div>

        {/* LISTA DE PACIENTES */}
        <div className="space-y-6 mt-6">
          {Object.entries(groupedPatients).map(([sector, sectorPatients], idx) => (
            <div key={idx} className="bg-transparent">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-300">
                <MapPin className="text-blue-700" size={20} />
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">
                  {sector}
                </h2>
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold ml-2">
                  {sectorPatients.length} PACIENTE(S)
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {sectorPatients.map((p) => (
                  <div
                    key={p.id}
                    className={`bg-white border-y border-r border-slate-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:shadow-md border-l-[16px] ${p.statusColor}`}
                  >
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="bg-slate-800 text-white text-[11px] font-black px-2 py-0.5 rounded shadow-sm">
                          LEITO {p.leito || 'N/A'}
                        </span>
                        <h3 className="font-bold text-slate-800 text-sm uppercase">
                          {p.nome}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Hash size={14} className="text-slate-400" />
                          <span className="font-medium">#{p.id.substring(0, 6)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Calendar size={14} className="text-slate-400" />
                          <span>Nasc: <span className="font-medium">{p.nascimento}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Clock size={14} className="text-slate-400" />
                          <span>Internação:</span>
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">
                            {calculateTimeElapsed(p.admission)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0 shrink-0 w-full md:w-auto bg-white">

                      {p.numeroSisreg ? (
                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm">
                          <Activity size={14} /> SISREG: {p.numeroSisreg} <span className="font-semibold opacity-75 ml-1">({p.dataSisreg})</span>
                        </div>
                      ) : (
                        (SETORES_URGENCIA.includes(p.setor?.toUpperCase())) && (
                          <button onClick={() => abrirModalSisreg(p)} className="flex items-center gap-1.5 bg-rose-50 border border-red-200 text-red-600 hover:bg-rose-600 hover:text-white px-3 py-2 rounded-lg font-black text-[10px] shadow-sm animate-pulse transition-colors">
                            <AlertTriangle size={14} /> FALTA SISREG
                          </button>
                        )
                      )}

                      <button onClick={() => openNotesPanel(p)} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-black text-[10px] shadow-sm transition-colors">
                        <FileText size={14} /> {(p.historico && p.historico.length > 0) ? `NOTAS (${p.historico.length})` : 'ADICIONAR NOTA'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {motorFiltragem.filtrados.length === 0 && (
            <div className="text-center p-12 bg-white rounded-lg border border-dashed border-slate-300">
              <Activity className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum paciente encontrado</h3>
              <p className="mt-1 text-sm text-slate-500">Altere os filtros ou aguarde a atualização de dados.</p>
            </div>
          )}
        </div>

      </main>

      {/* --- SLIDE-OVER NOTAS (Premium Design) --- */}
      {isNotesOpen && activePatient && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Fundo Opaco */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsNotesOpen(false)}
          ></div>

          {/* Painel Lateral */}
          <div className="relative w-full md:w-1/3 min-w-[320px] max-w-md bg-white shadow-2xl h-full flex flex-col transform transition-transform duration-300 translate-x-0 border-l border-slate-200">
            {/* Header do Painel */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#1e293b] text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg shadow-inner">
                  <FileText size={20} className="text-blue-300" />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight uppercase tracking-tight">{activePatient.nome}</h2>
                  <p className="text-xs text-slate-400 font-medium">LEITO {activePatient.leito || 'N/A'} - {activePatient.setor}</p>
                </div>
              </div>
              <button
                onClick={() => setIsNotesOpen(false)}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Lista de Notas (Scrollável) */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
              {(!activePatient.historico || activePatient.historico.length === 0) ? (
                <div className="text-center py-12 px-4">
                  <Activity className="mx-auto h-12 w-12 text-slate-300 mb-3 opacity-50" />
                  <p className="text-sm font-semibold text-slate-500">Nenhuma evolução registrada.</p>
                  <p className="text-xs text-slate-400 mt-1">Insira a primeira nota médica ou de enfermagem abaixo.</p>
                </div>
              ) : (
                activePatient.historico.map((nota, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{new Date(nota.data).toLocaleString('pt-BR')}</span>
                      </div>
                      <button
                        onClick={() => {
                          setNoteText(nota.texto);
                          setEditingNoteIndex(idx);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-md transition-all"
                        title="Editar nota"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {nota.texto}
                    </div>
                    <div className="mt-3 text-[10px] font-semibold text-slate-400 text-right">
                      Resp: {nota.usuario}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer de Input Fixado */}
            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {editingNoteIndex !== null && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">Editando Nota...</span>
                  <button
                    onClick={() => { setEditingNoteIndex(null); setNoteText(''); }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <div className="relative flex items-end">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Descreva a evolução ou observação..."
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl pl-4 pr-12 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[80px]"
                ></textarea>
                <button
                  onClick={saveNote}
                  disabled={!noteText.trim()}
                  className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
