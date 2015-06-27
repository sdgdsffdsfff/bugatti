package models.conf

import java.sql.SQLException

import models.MaybeFilter

import scala.slick.driver.MySQLDriver.simple._
import play.api.Play.current
import enums.{StateEnum, ContainerTypeEnum}
import enums.ContainerTypeEnum.Container
import enums.StateEnum.State
import scala.slick.jdbc.JdbcBackend
import scala.language.postfixOps
import scala.language.implicitConversions

/**
 * 环境和项目的关系配置
 */
case class Host(id: Option[Int], envId: Option[Int], projectId: Option[Int], preProjectId: Option[Int], areaId: Option[Int],
                                 syndicName: String, spiritId: Int, name: String, ip: String, ipClash: Int, state: State,
                                 containerType: Container, hostIp: Option[String], hostName: Option[String],
                                 globalVariable: Seq[Variable])
case class EnvRelForm(envId: Int, projectId: Int, ids: Seq[Int])

case class Ip(a: Int, b: Int, c: Int, d: Int, e: Int)
case class HostIp(id: Option[Int], envId: Option[Int], projectId: Option[Int], preProjectId: Option[Int], areaId: Option[Int],
                  syndicName: String, spiritId: Int, name: String, ip: Ip, ipClash: Int, state: State,
                  containerType: Container, hostIp: Option[String], hostName: Option[String],
                  globalVariable: Seq[Variable]) {
  val hosts = (ip.d to ip.e) map { i =>
    val _ip = ip.a + "." + ip.b + "." + ip.c + "." + i
    Host(id, envId, projectId, preProjectId, areaId, syndicName, spiritId, name = name.format(i), _ip, ipClash, state,
      containerType, hostIp, hostName, globalVariable)
  }
}

class HostTable(tag: Tag) extends Table[Host](tag, "host") {
  def id = column[Int]("id", O.PrimaryKey, O.AutoInc)
  def envId = column[Int]("env_id", O.Nullable)
  def projectId = column[Int]("project_id", O.Nullable)
  def preProjectId = column[Int]("pre_project_id", O.Nullable)
  def areaId = column[Int]("area_id", O.Nullable)
  def syndicName = column[String]("syndic_name")
  def spiritId = column[Int]("spirit_id")
  def name = column[String]("name")
  def ip = column[String]("ip")
  def ipClash = column[Int]("ip_clash", O.Default(0))
  def state = column[State]("state", O.Default(StateEnum.noKey))
  def containerType = column[Container]("container_type", O.Default(ContainerTypeEnum.vm), O.DBType("ENUM('vm', 'docker')"))
  def hostIp = column[String]("host_ip", O.Nullable)
  def hostName = column[String]("host_name", O.Nullable)
  // 覆盖项目属性，仅记录key\value普通键值对
  def globalVariable = column[Seq[Variable]]("global_variable", O.DBType("text"))(MappedColumnType.base[Seq[Variable], String](
    _.filter(!_.value.isEmpty).map(v => s"${v.name}:${v.value}").mkString(","),
    _.split(",").filterNot(_.trim.isEmpty).map(_.split(":") match { case Array(name, value) => new Variable(name, value) }).toList
  ))

  override def * = (id.?, envId.?, projectId.?, preProjectId.?, areaId.?, syndicName, spiritId, name, ip, ipClash, state, containerType, hostIp.?, hostName.?, globalVariable) <> (Host.tupled, Host.unapply _)
  index("idx_eid_pid", (envId, projectId))
  index("idx_ip", (ip, ipClash), unique = true)
}

object HostHelper {
  import models.AppDB._
  val qHost = TableQuery[HostTable]
  val qEnv = TableQuery[EnvironmentTable]
  val qProject = TableQuery[ProjectTable]

  implicit def maybeFilterConversor[X,Y](q:Query[X,Y,Seq]) = new MaybeFilter(q)

  def findById(id: Int): Option[Host] = db withSession { implicit session =>
    qHost.filter(_.id === id).firstOption
  }

  def findByIp(ip: String): Seq[Host] = db withSession { implicit session =>
    qHost.filter(_.ip === ip).list
  }

  def findBySyndicName(syndicName: String): Seq[Host] = db withSession{ implicit session =>
    qHost.filter(_.syndicName === syndicName).list
  }

  def findBySpiritId(spiritId: Int): Seq[Host] = db withSession{ implicit session =>
    qHost.filter(_.spiritId === spiritId).list
  }

  def findByEnvId_ProjectId(envId: Int, projectId: Int): Seq[Host] = db withSession {
    implicit session =>
      qHost.filter(r => r.envId === envId && r.projectId === projectId).list
  }

  def findByEnvId_AreaId(envId: Int, areaId: Int): Seq[Host] = db withSession { implicit session =>
    qHost.filter(r => r.envId === envId && r.areaId === areaId).list
  }

  def findUnbindByEnvId_AreaId(envId: Int, areaId: Int): Seq[Host] = db withSession { implicit session =>
    qHost.filter(r => r.envId === envId && r.areaId === areaId && r.projectId.?.isEmpty).list
  }

  def findEmptyEnvsBySyndicName(syndicName: String): Seq[Host] = db withSession { implicit session =>
    qHost.filter(c => c.syndicName === syndicName && c.envId.?.isEmpty).list
  }

  def findIpsByEnvId(envId: Int): Seq[Host] = db withSession { implicit session =>
    qHost.filter(r => r.envId === envId && r.projectId.?.isEmpty).list
  }

  def allNotEmpty: Seq[Host] = db withSession { implicit session =>
    qHost.filter(r => r.envId.?.isDefined && r.projectId.?.isDefined).list
  }

  def all(ip: Option[String], envId: Option[Int], projectId: Option[Int], sort: Option[String], direction: Option[String], page: Int, pageSize: Int): Seq[Host] = db withSession { implicit session =>
    val offset = pageSize * page
    var query = qHost
      .filteredBy(envId)(_.envId === envId)
      .filteredBy(projectId)(_.projectId === projectId)
      .filteredBy(ip)(_.ip like s"${ip.get}%").query
    sort match {
      case Some(s) if s == "ip" =>
        query = direction match { case Some(d) if d == "desc" => query.sortBy(_.ip desc); case _ => query.sortBy(_.ip asc)}
      case _ =>
        query = query.sortBy(_.projectId desc) // default sort by projectId
    }
    query.drop(offset).take(pageSize).list
  }

  def count(ip: Option[String], envId: Option[Int], projectId: Option[Int]): Int = db withSession { implicit session =>
    val query = qHost
      .filteredBy(envId)(_.envId === envId)
      .filteredBy(projectId)(_.projectId === projectId)
      .filteredBy(ip)(_.ip like s"${ip.get}%").query
    query.length.run
  }

  def create(host: Host) = db withSession { implicit session =>
    qHost.returning(qHost.map(_.id)).insert(host)
  }

  def create_result(host: Host) = db withSession { implicit session =>
    try {
      qHost.insert(host)
    } catch {
      case se: SQLException => -1
    }
  }

  def bind(relForm: EnvRelForm): Int = db withSession { implicit session =>
    relForm.ids.map { id =>
      findById(id) match {
        case Some(host) =>
          if (host.preProjectId.nonEmpty && host.preProjectId.get == relForm.projectId) {
            qHost.filter(_.id === id).map(_.projectId).update(relForm.projectId)
          } else {
            qHost.filter(_.id === id).map(h => (h.projectId, h.globalVariable)).update((relForm.projectId, List.empty[Variable]))
          }
        case _ => 0
      }
    }.sum
  }

  def _unbindByProjectId(projectId: Option[Int])(implicit session: JdbcBackend#Session) = {
    qHost.filter(_.projectId === projectId).map(h => (h.projectId.?, h.preProjectId.?)).update((None, projectId))
  }

  def unbind(host: Host) = db withTransaction { implicit session =>
    qHost.filter(_.id === host.id).update(host.copy(projectId = None, preProjectId = host.projectId))
  }

  def update(host: Host) = db withSession { implicit session =>
    qHost.filter(_.id === host.id).update(host)
  }

  def updateStateBySpiritId_Name(spiritId: Int, name: String, state: State) = db withSession { implicit session =>
    qHost.filter(x => x.spiritId === spiritId && x.name === name).map(_.state).update(state)
  }

  def delete(host: Host) = db withSession { implicit session =>
    qHost.filter(_.id === host.id).delete
  }

}