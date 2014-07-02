package models.conf

import enums.LevelEnum
import play.api.Play.current
import models.PlayCache
import org.joda.time.DateTime

import scala.slick.driver.MySQLDriver.simple._
import com.github.tototoshi.slick.MySQLJodaSupport._

import scala.slick.jdbc.JdbcBackend

/**
 * 项目
 * 项目为综合型，通过类型标示不同
 *
 * @author of546
 */
case class Project(id: Option[Int], name: String, templateId: Int, subTotal: Int, lastVid: Option[Int], lastVersion: Option[String], lastUpdated: Option[DateTime])
case class ProjectForm(id: Option[Int], name: String, templateId: Int, subTotal: Int, lastVid: Option[Int], lastVersion: Option[String], lastUpdated: Option[DateTime], items: List[Attribute]) {
  def toProject = Project(id, name, templateId, subTotal, lastVid, lastVersion, lastUpdated)
}

class ProjectTable(tag: Tag) extends Table[Project](tag, "project") {
  def id = column[Int]("id", O.PrimaryKey, O.AutoInc)
  def name = column[String]("name", O.NotNull)
  def templateId = column[Int]("template_id", O.NotNull)  // 项目模板编号
  def subTotal = column[Int]("sub_total", O.NotNull, O.Default(0)) // 子项目数量
  def lastVid = column[Int]("last_vid", O.Nullable)
  def lastVersion = column[String]("last_version", O.Nullable)
  def lastUpdated= column[DateTime]("last_updated", O.Nullable, O.Default(DateTime.now()))

  override def * = (id.?, name, templateId, subTotal, lastVid.?, lastVersion.?, lastUpdated.?) <> (Project.tupled, Project.unapply _)
  def idx = index("idx_name", name, unique = true)
  def idx_template = index("idx_template", templateId)
}

object ProjectHelper extends PlayCache {

  import models.AppDB._

  val qProject = TableQuery[ProjectTable]

  def findById(id: Int) = db withSession { implicit session =>
    qProject.where(_.id is id).firstOption
  }

  def findByName(name: String) = db withSession { implicit session =>
    qProject.where(_.name is name).firstOption
  }

  // templateId
  def countByTid(tid: Int) = db withSession { implicit session =>
    Query(qProject.where(_.templateId is tid).length).first
  }

  def count: Int = db withSession { implicit session =>
    Query(qProject.length).first
  }

  def all(page: Int, pageSize: Int): List[Project] = db withSession { implicit session =>
    val offset = pageSize * page
    qProject.drop(offset).take(pageSize).list
  }

  def all(): List[Project] = db withSession { implicit session =>
    qProject.list
  }

  def create(project: Project) = db withSession { implicit session =>
    qProject.insert(project)
  }

  def create_(project: Project)(implicit session: JdbcBackend#Session) = {
    qProject.returning(qProject.map(_.id)).insert(project)(session)
  }

  def create(projectForm: ProjectForm, jobNo: String) = db withTransaction { implicit session =>
    val pid = create_(projectForm.toProject)
    val attrs = projectForm.items.map(item =>
      Attribute(None, Some(pid), item.name, item.value)
    )
    AttributeHelper.create(attrs)
    MemberHelper.create_(Member(None, pid, LevelEnum.safe, jobNo))
  }

  def delete(id: Int) = db withSession { implicit session =>
    qProject.where(_.id is id).delete
  }

  def update(id: Int, projectForm: ProjectForm) = db withSession { implicit session =>
    AttributeHelper.deleteByPid_(id)
    val attrs = projectForm.items.map(item =>
      Attribute(None, Some(id), item.name, item.value)
    )
    AttributeHelper.create(attrs)
    update_(id, projectForm.toProject)
  }

  def update_(id: Int, project: Project)(implicit session: JdbcBackend#Session) = {
    val project2update = project.copy(Some(id))
    qProject.where(_.id is id).update(project2update)(session)
  }

}
