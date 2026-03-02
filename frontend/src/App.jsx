import React, { useState, useEffect, useRef } from 'react';
import { differenceInHours, differenceInDays } from 'date-fns';
import {
  Activity, Printer, Upload, RefreshCw, Search,
  MapPin, Clock, Calendar, AlertTriangle, FileText,
  User, Hash, FileSpreadsheet
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { db } from './config/firebase';
import { processExcelUpload } from './services/syncEngine';

const calculateTimeElapsed = (admissionDate) => {
  const now = new Date();
  const hours = differenceInHours(now, admissionDate);
  const days = differenceInDays(now, admissionDate);

  if (hours < 24) {
    return `${hours} horas`;
  }

  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} dia(s) e ${remainingHours} hora(s)` : `${days} dia(s)`;
};

const DUMMY_DATE = new Date();
const mockPatients = [
  { id: 1, name: 'JOÃO SILVA', sector: 'PS DECISÃO CLÍNICA', admission: new Date(DUMMY_DATE.getTime() - 14 * 60 * 60 * 1000), category: 'Estável', statusColor: 'border-emerald-500', birth: '15/05/1980', bed: 'L01', sisreg: true, notes: 0 },
  { id: 2, name: 'RAFAEL COSTA', sector: 'PS DECISÃO CLÍNICA', admission: new Date(DUMMY_DATE.getTime() - 50 * 60 * 60 * 1000), category: 'Atenção', statusColor: 'border-amber-500', birth: '22/10/1975', bed: 'L02', sisreg: false, notes: 2 },
  { id: 3, name: 'PEDRO SANTOS', sector: 'UTI ADULTO', admission: new Date(DUMMY_DATE.getTime() - 4 * 24 * 60 * 60 * 1000), category: 'Alerta', statusColor: 'border-orange-500', birth: '03/01/1960', bed: 'U05', sisreg: true, notes: 1 },
  { id: 4, name: 'ANA COSTA', sector: 'ENFERMARIA CIRÚRGICA', admission: new Date(DUMMY_DATE.getTime() - 10 * 24 * 60 * 60 * 1000), category: 'Crítico', statusColor: 'border-red-500', birth: '12/12/1990', bed: 'E10', sisreg: false, notes: 0 },
  { id: 5, name: 'LUCAS LIMA', sector: 'UTI ADULTO', admission: new Date(DUMMY_DATE.getTime() - 20 * 24 * 60 * 60 * 1000), category: 'Crônico', statusColor: 'border-purple-500', birth: '30/08/1955', bed: 'U08', sisreg: true, notes: 5 },
  { id: 6, name: 'JULIA ALVES', sector: 'ENFERMARIA CIRÚRGICA', admission: new Date(DUMMY_DATE.getTime() - 45 * 24 * 60 * 60 * 1000), category: 'Revisão', statusColor: 'border-slate-800', birth: '05/04/1982', bed: 'E15', sisreg: true, notes: 1 },
];

const groupedPatients = mockPatients.reduce((acc, patient) => {
  if (!acc[patient.sector]) acc[patient.sector] = [];
  acc[patient.sector].push(patient);
  return acc;
}, {});

function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const fileInputRef = useRef(null);

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

        const dadosTratados = rows
          .filter(row => row[0])
          .map(row => ({
            nome: String(row[0] || ''),
            nascimento: row[1],
            sexo: String(row[2] || ''),
            dataInternacao: row[3],
            setor: String(row[4] || ''),
            leito: String(row[5] || ''),
            especialidade: String(row[6] || '')
          }));

        await processExcelUpload(dadosTratados, db);
        Swal.fire('Sincronizado', 'O censo foi atualizado com sucesso.', 'success');
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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* NAVBAR */}
      <header className="bg-[#1e293b] text-white shadow-md flex items-center justify-between px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img
            src="/logo-joinville.png"
            alt="Logo Joinville"
            className="h-10 w-auto object-contain bg-white rounded p-1"
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
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-medium transition-colors"
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
            <div className="text-lg">{formattedTime}</div>
            <div className="text-xs opacity-75">{formattedDate}</div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* KPI GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-emerald-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ATÉ 48 HORAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-amber-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">48 A 72 HORAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-orange-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">72H A 7 DIAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-red-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">7 A 15 DIAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-purple-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">15 A 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-slate-800 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">MAIS DE 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">1</div>
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
                  placeholder="Nome, Prontuário..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Setor</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50">
                <option value="">Todos os Setores</option>
                <option value="PS DECISÃO CLÍNICA">PS DECISÃO CLÍNICA</option>
                <option value="UTI ADULTO">UTI ADULTO</option>
                <option value="ENFERMARIA CIRÚRGICA">ENFERMARIA CIRÚRGICA</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50">
                <option value="">Todos os Status</option>
                <option value="Estável">Estável (&lt; 48h)</option>
                <option value="Atenção">Atenção (48h a 72h)</option>
                <option value="Crítico">Crítico (7 a 15 dias)</option>
              </select>
            </div>

            <div className="flex gap-4 xl:col-span-2 mt-4 xl:mt-0 xl:justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Sem SISREG</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Com Notas</span>
              </label>
            </div>
          </div>
        </div>

        {/* LISTA DE PACIENTES */}
        <div className="space-y-8">
          {Object.entries(groupedPatients).map(([sector, patients], idx) => (
            <div key={idx} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <MapPin className="text-blue-600" size={20} />
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">
                  {sector}
                </h2>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold ml-2">
                  {patients.length} PACIENTE(S)
                </span>
              </div>

              <div className="flex flex-col gap-4">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className={`bg - white border text - slate - 800 border - slate - 200 rounded shadow - sm flex flex - col w - full border - l - [16px] ${patient.statusColor} `}
                  >
                    <div className="p-4 flex-1">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <h3 className="font-extrabold text-base leading-tight uppercase line-clamp-2">
                          {patient.name}
                        </h3>
                        <div className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shrink-0 flex items-center gap-1">
                          LEITO {patient.bed}
                        </div>
                      </div>

                      <div className="space-y-2 mt-4 text-sm">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Hash size={14} className="text-slate-400" />
                          <span className="font-medium">#{10000 + patient.id}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar size={14} className="text-slate-400" />
                          <span>Nasc: <span className="font-medium">{patient.birth}</span></span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock size={14} className="text-slate-400" />
                          <span>Internação:</span>
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                            {calculateTimeElapsed(patient.admission)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 pt-0 border-t border-slate-100 mt-2 rounded-b flex items-center justify-between gap-2 flex-wrap">
                      {!patient.sisreg && (
                        <button className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded font-bold text-xs transition-colors group mt-3">
                          <AlertTriangle size={14} className="animate-pulse text-red-600 group-hover:text-red-700" />
                          FALTA SISREG
                        </button>
                      )}

                      {patient.notes > 0 && (
                        <button className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded font-bold text-xs transition-colors ml-auto mt-3">
                          <FileText size={14} />
                          NOTAS ({patient.notes})
                        </button>
                      )}

                      {patient.notes === 0 && patient.sisreg && (
                        <div className="h-9 mt-3 w-full"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>

      </main>
    </div>
  );
}

export default App;
